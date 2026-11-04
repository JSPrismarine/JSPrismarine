import { OfflineAuthProvider } from '@jsprismarine/auth';
import { Logger } from '@jsprismarine/logger';
import { Config, Server } from '@jsprismarine/prismarine';
import type { InboundPacketRecord, InboundPacketTrace } from '@jsprismarine/prismarine/network/InboundPacketTrace';
import { InboundPacketTrace as PacketTrace } from '@jsprismarine/prismarine/network/InboundPacketTrace';
import type {
    OutboundPacketRecord,
    OutboundPacketRecorder
} from '@jsprismarine/prismarine/network/OutboundPacketTrace';
import type { ReplayInitialStateManifest } from '@jsprismarine/prismarine/network/ReplayManifest';
import { OutboundPacketTrace } from '@jsprismarine/prismarine/network/OutboundPacketTrace';
import { networkToken } from '@jsprismarine/prismarine/modules/tokens';
import type { World } from '@jsprismarine/prismarine/world/World';
import LevelDB from '@jsprismarine/prismarine/world/providers/leveldb/LevelDB';
import { MovePlayerPacket, PositionMode } from '@jsprismarine/protocol';
import MoveActorAbsolutePacket from '@jsprismarine/protocol/packet/MoveActorAbsolutePacket';
import UpdateAttributesPacket from '@jsprismarine/protocol/packet/UpdateAttributesPacket';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { describe, expect, it, vi } from 'vitest';
import {
    deserializeReplayInitialStateManifest,
    restoreReplayInitialStateSnapshot,
    serializeReplayInitialStateManifest
} from '@jsprismarine/prismarine/network/ReplayManifest';

// Some other server suites replace RakNet in a reused worker. This test needs the real socket
// path, so clear that mock before the server module is loaded.
vi.hoisted(() => {
    vi.doUnmock('@jsprismarine/raknet');
    vi.resetModules();
});

import Client from './Client';

interface Position {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

interface CapturedSession {
    readonly moverRuntimeId: bigint;
    readonly moverStart: Position;
    readonly movement: readonly InboundPacketRecord[];
    readonly replayRandomTickState: number;
    readonly initialStateManifest: Buffer;
    readonly inboundPayloadBytes: number;
    readonly inboundSerializedBytes: number;
}

interface GatedPacketTrace {
    readonly trace: OutboundPacketTrace;
    readonly recorder: OutboundPacketRecorder;
    setEnabled(enabled: boolean): void;
}

interface LiveSession {
    readonly server: Server;
    readonly world: World;
    readonly inbound: InboundPacketTrace;
    readonly outbound: GatedPacketTrace;
    readonly mover: Client;
    readonly observer: Client;
    readonly initialStateManifest?: Buffer;
    close(): Promise<void>;
}

const SESSION_SEED = '2847';
const REPLAY_START_TICK = 160;
const SAMPLE_LEAD_TICKS = 2;
const SAMPLE_TRAIL_TICKS = 4;
const MOVEMENT_COUNT = 4;
const PORT_BASE = 20_000 + (process.pid % 20_000);
const MOVER_ID = '00000000-0000-4000-8000-000000284701';
const OBSERVER_ID = '00000000-0000-4000-8000-000000284702';

const gatedPacketTrace = (): GatedPacketTrace => {
    const trace = new OutboundPacketTrace();
    let enabled = false;
    const recorder: OutboundPacketRecorder = {
        record(packet: OutboundPacketRecord): void {
            if (enabled) trace.record(packet);
        }
    };

    return {
        trace,
        recorder,
        setEnabled(value: boolean): void {
            enabled = value;
        }
    };
};

const seededRandom = (seed: number) => {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
        return state / 0x1_0000_0000;
    };
};

const waitForTick = (server: Server, expected: number): Promise<void> => {
    if (server.getTick() >= expected) return Promise.resolve();

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            server.removeListener('tick', onTick);
            reject(new Error(`Server did not reach tick ${expected}`));
        }, 20_000);
        const onTick = (event: { getTick(): number }): void => {
            if (event.getTick() < expected) return;
            clearTimeout(timeout);
            server.removeListener('tick', onTick);
            resolve();
        };
        server.on('tick', onTick);
    });
};

const waitFor = async (description: string, condition: () => boolean): Promise<void> => {
    const deadline = Date.now() + 20_000;
    while (!condition()) {
        if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${description}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
};

const positionOf = (position: { x: number; y: number; z: number }): Position => ({
    x: position.x,
    y: position.y,
    z: position.z
});

const replayPacketDigestsByTick = (
    trace: OutboundPacketTrace,
    stableRuntimeIds: ReadonlyMap<bigint, bigint>
): ReadonlyMap<number, string> => {
    const normalizedRuntimeIds = new Map(stableRuntimeIds);
    let nextStableRuntimeId = Math.max(...[...normalizedRuntimeIds.values()].map(Number)) + 1;
    const stableRuntimeIdFor = (runtimeId: bigint): bigint => {
        const known = normalizedRuntimeIds.get(runtimeId);
        if (known !== undefined) return known;
        // An actor can leave the world before the trace is hashed. First-seen packet order still
        // gives both fresh sessions the same comparison ID without retaining every actor object.
        const stableRuntimeId = BigInt(nextStableRuntimeId);
        nextStableRuntimeId += 1;
        normalizedRuntimeIds.set(runtimeId, stableRuntimeId);
        return stableRuntimeId;
    };
    const recordsByTick = new Map<number, OutboundPacketRecord[]>();
    const firstSequenceByConnection = new Map<number, number>();
    for (const record of trace.records()) {
        const atTick = recordsByTick.get(record.tick) ?? [];
        atTick.push(record);
        recordsByTick.set(record.tick, atTick);
        const firstSequence = firstSequenceByConnection.get(record.connectionId);
        if (firstSequence === undefined || record.sequence < firstSequence) {
            firstSequenceByConnection.set(record.connectionId, record.sequence);
        }
    }

    return new Map(
        [...recordsByTick].map(([tick, packets]) => {
            const stablePackets = packets
                .sort((left, right) =>
                    left.connectionId === right.connectionId
                        ? left.sequence - right.sequence
                        : left.connectionId - right.connectionId
                )
                .map((record) => {
                    const firstSequence = firstSequenceByConnection.get(record.connectionId);
                    if (firstSequence === undefined) throw new Error('Packet trace has no connection sequence start');
                    let payload: Uint8Array = Buffer.from(record.payload);
                    if (record.packetName === 'MoveActorAbsolutePacket') {
                        // New servers in one process allocate different runtime ids. Keep the
                        // packet bytes in the digest while mapping ids by the logged-in player.
                        const packet = new MoveActorAbsolutePacket(Buffer.from(payload));
                        packet.codecProtocol = record.protocolVersion;
                        packet.decode();
                        packet.runtimeEntityId = stableRuntimeIdFor(packet.runtimeEntityId);
                        payload = packet.encodeTransient();
                    } else if (record.packetName === 'UpdateAttributesPacket') {
                        const packet = new UpdateAttributesPacket(Buffer.from(payload));
                        packet.codecProtocol = record.protocolVersion;
                        packet.decode();
                        packet.runtimeEntityId = stableRuntimeIdFor(packet.runtimeEntityId);
                        payload = packet.encodeTransient();
                    }

                    return {
                        connectionId: record.connectionId,
                        // Absolute output sequence includes packets sent before this post-login
                        // capture window, so hash the order within the captured segment.
                        sequence: record.sequence - firstSequence,
                        protocolVersion: record.protocolVersion,
                        packetName: record.packetName,
                        payload: Buffer.from(payload).toString('base64')
                    };
                });

            return [tick, createHash('sha256').update(JSON.stringify(stablePackets)).digest('hex')];
        })
    );
};

/** Estimates serialized outbound trace size; OutboundPacketTrace does not define a storage format. */
const outboundJsonRecordBytes = (records: readonly OutboundPacketRecord[]): number =>
    Buffer.byteLength(
        JSON.stringify(
            records.map((record) => ({
                connectionId: record.connectionId,
                sequence: record.sequence,
                tick: record.tick,
                protocolVersion: record.protocolVersion,
                packetName: record.packetName,
                payload: Buffer.from(record.payload).toString('base64')
            }))
        )
    );

const openSession = async (
    port: number,
    moverAuth: OfflineAuthProvider,
    observerAuth: OfflineAuthProvider,
    options: {
        readonly serializableRandom?: boolean;
        readonly recordPackets?: boolean;
        readonly captureInitialState?: boolean;
        readonly initialState?: ReplayInitialStateManifest;
    } = {}
): Promise<LiveSession> => {
    const stateRoot = mkdtempSync(path.join(tmpdir(), 'jsprismarine-session-replay-'));
    vi.stubEnv('JSP_DIR', stateRoot);
    writeFileSync(
        path.join(stateRoot, 'config.json'),
        JSON.stringify({
            'online-mode': false,
            'preload-radius': 0,
            'view-distance': 1,
            'max-players': 2,
            worlds: { world: { preset: 'minecraft:flat', provider: 'LevelDB', seed: SESSION_SEED } }
        })
    );

    const inbound = new PacketTrace();
    const outbound = gatedPacketTrace();
    const server = new Server({
        logger: new Logger('error'),
        config: new Config(),
        headless: true,
        ...(options.recordPackets === false
            ? {}
            : { inboundPacketRecorder: inbound, outboundPacketRecorder: outbound.recorder })
    });
    if (!options.serializableRandom) server.setRandom(seededRandom(Number(SESSION_SEED)));

    const mover = new Client({
        host: '127.0.0.1',
        port,
        auth: moverAuth,
        logger: new Logger('error'),
        loginTimeoutMs: 30_000
    });
    const observer = new Client({
        host: '127.0.0.1',
        port,
        auth: observerAuth,
        logger: new Logger('error'),
        loginTimeoutMs: 30_000
    });

    try {
        if (options.initialState !== undefined) {
            const provider = new LevelDB(path.join(stateRoot, 'worlds', 'world'), server);
            await restoreReplayInitialStateSnapshot(provider, options.initialState);
        }
        await server.bootstrap('127.0.0.1', port);
        if (options.serializableRandom) {
            const randomState = server.getReplayRandomState();
            server.restoreReplayRandomState({
                ...randomState,
                server: { ...randomState.server, state: Number(SESSION_SEED) }
            });
        }
        const world = server.getWorldManager().getWorldByName('world');
        if (world === null) throw new Error('The default world did not load');
        // This flat fixture is a slime-spawn biome; disable natural spawning before clients join
        // so the digest compares the scripted session rather than unrelated mob spawn timing.
        world.getGameRuleManager().setGameRule('doMobSpawning', false, true);
        const initialStateManifest = options.captureInitialState
            ? serializeReplayInitialStateManifest(await world.getLevel().captureReplayInitialState())
            : undefined;
        if (options.initialState !== undefined) {
            const level = world.getLevel();
            level.setTicks(options.initialState.level.tick);
            level.getWeather().restore(options.initialState.level.weather);
            level.restoreReplayRandomState(options.initialState);
        }
        await mover.connect();
        await observer.connect();

        return {
            server,
            world,
            inbound,
            outbound,
            mover,
            observer,
            ...(initialStateManifest === undefined ? {} : { initialStateManifest }),
            close: async () => {
                mover.disconnect();
                observer.disconnect();
                await server.shutdown({ stayAlive: true });
                rmSync(stateRoot, { recursive: true, force: true });
            }
        };
    } catch (error: unknown) {
        mover.disconnect();
        observer.disconnect();
        await server.shutdown({ stayAlive: true }).catch(() => {});
        rmSync(stateRoot, { recursive: true, force: true });
        throw error;
    }
};

const captureSession = async (
    moverAuth: OfflineAuthProvider,
    observerAuth: OfflineAuthProvider
): Promise<CapturedSession> => {
    const live = await openSession(PORT_BASE, moverAuth, observerAuth, {
        captureInitialState: true,
        serializableRandom: true
    });
    const randomTickStateByTick = new Map<number, number>();
    const recordRandomTickState = (event: { getTick(): number }): void => {
        randomTickStateByTick.set(event.getTick(), live.world.getSystems().getRandomTickState());
    };
    try {
        const initialStateManifest = live.initialStateManifest;
        if (initialStateManifest === undefined) throw new Error('Replay initial-state manifest was not captured');
        const startGame = live.mover.getStartGame();
        if (startGame === null) throw new Error('Mover did not receive StartGame');
        const moverStart = positionOf(startGame.position);
        const firstSendTick = live.server.getTick() + 4;
        live.server.on('tick', recordRandomTickState);
        for (let index = 0; index < MOVEMENT_COUNT; index += 1) {
            await waitForTick(live.server, firstSendTick + index * 4);
            await live.mover.getSession().send(
                new MovePlayerPacket({
                    runtimeEntityId: startGame.runtimeEntityId,
                    position: { x: moverStart.x + (index + 1) * 0.25, y: moverStart.y, z: moverStart.z },
                    pitch: 0,
                    yaw: 0,
                    headYaw: 0,
                    mode: PositionMode.Normal,
                    onGround: true,
                    ridingEntityRuntimeId: 0n,
                    tick: BigInt(index + 1)
                })
            );
            await waitFor(
                `movement packet ${index + 1}`,
                () => live.inbound.records().filter((record) => record.packetName === 'MovePlayerPacket').length > index
            );
        }

        const movement = live.inbound.records().filter((record) => record.packetName === 'MovePlayerPacket');
        if (movement.length !== MOVEMENT_COUNT) {
            throw new Error(`Captured ${movement.length} movement packets, expected ${MOVEMENT_COUNT}`);
        }
        const firstMovement = movement[0];
        if (firstMovement === undefined) throw new Error('The captured movement segment is empty');
        const replayRandomTickState = randomTickStateByTick.get(firstMovement.tick - SAMPLE_LEAD_TICKS);
        if (replayRandomTickState === undefined) {
            throw new Error(`No random tick state was recorded at tick ${firstMovement.tick - SAMPLE_LEAD_TICKS}`);
        }

        return {
            moverRuntimeId: startGame.runtimeEntityId,
            moverStart,
            movement,
            replayRandomTickState,
            initialStateManifest,
            inboundPayloadBytes: live.inbound.getPayloadBytes(),
            inboundSerializedBytes: live.inbound.serialize().byteLength
        };
    } finally {
        live.server.removeListener('tick', recordRandomTickState);
        await live.close();
    }
};

const replaySession = async (
    port: number,
    moverAuth: OfflineAuthProvider,
    observerAuth: OfflineAuthProvider,
    captured: CapturedSession,
    options: {
        readonly measureCosts?: boolean;
        readonly instrumented?: boolean;
        readonly serializableRandom?: boolean;
    } = {}
) => {
    const measureCosts = options.measureCosts ?? false;
    const instrumented = options.instrumented ?? true;
    const initialState = deserializeReplayInitialStateManifest(captured.initialStateManifest);
    const live = await openSession(port, moverAuth, observerAuth, {
        serializableRandom: options.serializableRandom,
        recordPackets: !measureCosts || instrumented,
        initialState
    });
    try {
        const startGame = live.mover.getStartGame();
        if (startGame === null) throw new Error('Replay mover did not receive StartGame');
        expect(positionOf(startGame.position)).toEqual(captured.moverStart);
        const observerStartGame = live.observer.getStartGame();
        if (observerStartGame === null) throw new Error('Replay observer did not receive StartGame');
        const stableRuntimeIds = new Map<bigint, bigint>([
            [startGame.runtimeEntityId, 1n],
            [observerStartGame.runtimeEntityId, 2n]
        ]);
        // Replication also addresses mobs and other tracked actors. Assign those process-local IDs
        // by world order so output digests compare the same actors across fresh server instances.
        for (const entity of live.world.getEntities().sort((left, right) => {
            const leftId = left.getRuntimeId();
            const rightId = right.getRuntimeId();
            return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
        })) {
            const runtimeId = entity.getRuntimeId();
            if (!stableRuntimeIds.has(runtimeId)) {
                stableRuntimeIds.set(runtimeId, BigInt(stableRuntimeIds.size + 1));
            }
        }

        // The baseline installs no recorder. The mover still gets the source id because it logs in
        // first and the dispatcher assigns connection ids in admission order.
        const moverConnectionId = instrumented
            ? live.inbound.records().find((record) => record.sequence === 0)?.connectionId
            : captured.movement[0]?.connectionId;
        if (moverConnectionId === undefined) throw new Error('Replay session has no mover connection id');
        const mover = live.world.getPlayers().find((player) => player.getName() === 'ReplayMover');
        if (mover === undefined) throw new Error('Replay mover is missing from the world');
        let moveEvents = 0;
        const onMove = (): void => {
            moveEvents += 1;
        };
        live.server.on('playerMove', onMove);

        // The trace starts at the first movement, so replay logs in normally before feeding the
        // captured play-phase segment. Re-number it because replay counters begin at the live session.
        // Runtime entity ids are process-local, so decode and re-encode this input with the mover's
        // id from the fresh server while preserving every other recorded movement field.
        const records = captured.movement.map((record, index) => {
            const packet = new MovePlayerPacket(null, Buffer.from(record.payload));
            packet.decode();
            const data = packet.getPacketData();
            if (data === null) throw new Error('Captured movement packet has no payload');
            if (data.runtimeEntityId !== captured.moverRuntimeId) {
                throw new Error(
                    `Captured movement names runtime id ${data.runtimeEntityId}, expected ${captured.moverRuntimeId}`
                );
            }

            const payload = new MovePlayerPacket({
                ...data,
                runtimeEntityId: startGame.runtimeEntityId
            }).encodeTransient();
            return { ...record, connectionId: moverConnectionId, order: index, sequence: index, payload };
        });
        const firstRecord = records[0];
        if (firstRecord === undefined) throw new Error('The captured movement segment is empty');
        const tickOffset = REPLAY_START_TICK - firstRecord.tick;
        const recordsByTick = new Map<number, InboundPacketRecord[]>();
        for (const record of records) {
            const tick = record.tick + tickOffset;
            const atTick = recordsByTick.get(tick) ?? [];
            atTick.push(record);
            recordsByTick.set(tick, atTick);
        }

        const lastReplayTick = Math.max(...recordsByTick.keys());
        const sampleStart = REPLAY_START_TICK - SAMPLE_LEAD_TICKS;
        const sampleEnd = lastReplayTick + SAMPLE_TRAIL_TICKS;
        const worldDigests = new Map<number, string>();
        const replayErrors: string[] = [];
        let measurementStart: { readonly wallMs: number; readonly cpu: NodeJS.CpuUsage } | undefined;
        let measurementEnd: { readonly wallMs: number; readonly cpu: NodeJS.CpuUsage } | undefined;
        let worldDigestWallMs = 0;
        let worldDigestCpuMs = 0;
        let checkpoint:
            | {
                  readonly wallMs: number;
                  readonly cpuMs: number;
                  readonly serializedBytes: number;
              }
            | undefined;
        if (measureCosts && instrumented) {
            // Capture and serialization measure the provider snapshot copy alongside the loaded-state digests.
            const level = live.world.getLevel();
            const wallStarted = performance.now();
            const cpuStarted = process.cpuUsage();
            const manifest = await level.captureReplayInitialState();
            const serializedManifest = serializeReplayInitialStateManifest(manifest);
            level.restoreReplayRandomState(deserializeReplayInitialStateManifest(serializedManifest));
            const cpu = process.cpuUsage(cpuStarted);
            checkpoint = {
                wallMs: performance.now() - wallStarted,
                cpuMs: (cpu.user + cpu.system) / 1000,
                serializedBytes: serializedManifest.byteLength
            };
        }
        const networking = live.server.getKernel().get(networkToken);
        if (networking.replayInboundRecord === undefined) {
            throw new Error('The server networking module cannot replay packets');
        }
        // The service method reads its dispatcher through `this`, so retain the receiver.
        const replayInboundRecord = networking.replayInboundRecord.bind(networking);

        let resolveComplete!: () => void;
        const complete = new Promise<void>((resolve) => {
            resolveComplete = resolve;
        });
        const onTick = async (event: { getTick(): number }): Promise<void> => {
            const tick = event.getTick();
            if (tick === sampleStart && instrumented) live.outbound.setEnabled(true);
            // Tick events run before world updates, so stop here to exclude the tick after the sample.
            if (measureCosts && instrumented && tick === sampleEnd + 1) live.outbound.setEnabled(false);
            if (measureCosts && tick === sampleStart) {
                measurementStart = { wallMs: performance.now(), cpu: process.cpuUsage() };
            }
            if (tick >= sampleStart && tick <= sampleEnd && instrumented) {
                if (tick === sampleStart) {
                    // Login and asynchronous chunk startup are outside the recorded play-phase trace.
                    // Restore the captured counter at the segment boundary so their variable draw
                    // counts cannot shift every later Java random-tick position.
                    live.world.getSystems().restoreRandomTickState(captured.replayRandomTickState);
                }
                if (measureCosts) {
                    const digestWallStarted = performance.now();
                    const digestCpuStarted = process.cpuUsage();
                    worldDigests.set(tick - REPLAY_START_TICK, live.world.replayStateDigest());
                    const digestCpu = process.cpuUsage(digestCpuStarted);
                    worldDigestWallMs += performance.now() - digestWallStarted;
                    worldDigestCpuMs += (digestCpu.user + digestCpu.system) / 1000;
                } else {
                    worldDigests.set(tick - REPLAY_START_TICK, live.world.replayStateDigest());
                }
            }

            for (const record of recordsByTick.get(tick) ?? []) {
                try {
                    await replayInboundRecord(record, tickOffset);
                } catch (error: unknown) {
                    replayErrors.push(error instanceof Error ? error.message : String(error));
                }
            }
            if (measureCosts && tick === sampleEnd + 1) {
                if (measurementStart === undefined) throw new Error('Replay cost sample did not start');
                measurementEnd = {
                    wallMs: performance.now(),
                    cpu: process.cpuUsage(measurementStart.cpu)
                };
                resolveComplete();
            } else if (!measureCosts && tick === sampleEnd) resolveComplete();
        };

        expect(live.server.getTick()).toBeLessThan(sampleStart);
        live.server.on('tick', onTick);
        try {
            await complete;
            await waitForTick(live.server, sampleEnd + 1);
        } finally {
            live.server.removeListener('tick', onTick);
            live.server.removeListener('playerMove', onMove);
            live.outbound.setEnabled(false);
        }
        if (replayErrors.length > 0) throw new Error(`Replay rejected packets: ${replayErrors.join('; ')}`);

        const worldSeries = instrumented
            ? Array.from({ length: sampleEnd - sampleStart + 1 }, (_unused, index) => {
                  const tick = sampleStart + index;
                  const digest = worldDigests.get(tick - REPLAY_START_TICK);
                  if (digest === undefined) throw new Error(`No world digest was captured at tick ${tick}`);
                  return [tick - REPLAY_START_TICK, digest] as const;
              })
            : [];
        let outboundDigestWallMs = 0;
        let outboundDigestCpuMs = 0;
        let packetDigests: ReadonlyMap<number, string> = new Map();
        if (instrumented && measureCosts) {
            const outboundDigestWallStarted = performance.now();
            const outboundDigestCpuStarted = process.cpuUsage();
            packetDigests = replayPacketDigestsByTick(live.outbound.trace, stableRuntimeIds);
            const outboundDigestCpu = process.cpuUsage(outboundDigestCpuStarted);
            outboundDigestWallMs = performance.now() - outboundDigestWallStarted;
            outboundDigestCpuMs = (outboundDigestCpu.user + outboundDigestCpu.system) / 1000;
        } else if (instrumented) {
            packetDigests = replayPacketDigestsByTick(live.outbound.trace, stableRuntimeIds);
        }
        const packetSeries = instrumented
            ? Array.from({ length: sampleEnd - sampleStart + 1 }, (_unused, index) => {
                  const tick = sampleStart + index;
                  return [tick - REPLAY_START_TICK, packetDigests.get(tick) ?? null] as const;
              })
            : [];
        const finalPosition = mover.getPosition();
        const finalWorldDigest = measureCosts ? live.world.replayStateDigest() : undefined;
        const outboundRecords = live.outbound.trace.records();
        const outboundJsonBytes = measureCosts ? outboundJsonRecordBytes(outboundRecords) : 0;
        if (measureCosts && measurementStart === undefined) throw new Error('Replay cost sample did not start');
        if (measureCosts && measurementEnd === undefined) throw new Error('Replay cost sample did not end');
        const sampleTicks = sampleEnd + 1 - sampleStart;
        const tickCpuMs =
            measurementEnd?.cpu === undefined ? 0 : (measurementEnd.cpu.user + measurementEnd.cpu.system) / 1000;
        const tickWallMs =
            measurementStart === undefined || measurementEnd === undefined
                ? 0
                : measurementEnd.wallMs - measurementStart.wallMs;

        return {
            worldSeries,
            packetSeries,
            moveEvents,
            finalWorldDigest,
            finalMoverPosition: {
                x: finalPosition.getX(),
                y: finalPosition.getY(),
                z: finalPosition.getZ()
            },
            ...(measureCosts
                ? {
                      measurements: {
                          sampleTicks,
                          tickCpuMs,
                          tickWallMs,
                          worldDigestCalls: worldSeries.length,
                          worldDigestWallMs,
                          worldDigestCpuMs,
                          outboundDigestTicks: packetDigests.size,
                          outboundDigestWallMs,
                          outboundDigestCpuMs,
                          checkpoint,
                          storage: {
                              inputTracePayloadBytes: captured.inboundPayloadBytes,
                              inputTraceSerializedBytes: captured.inboundSerializedBytes,
                              replayTracePayloadBytes: live.inbound.getPayloadBytes(),
                              replayTraceSerializedBytes: live.inbound.serialize().byteLength,
                              outboundPayloadBytes: live.outbound.trace.getPayloadBytes(),
                              outboundJsonRecordBytes: outboundJsonBytes,
                              manifestBytes: captured.initialStateManifest.byteLength,
                              estimatedArtifactBytes:
                                  captured.inboundSerializedBytes +
                                  outboundJsonBytes +
                                  captured.initialStateManifest.byteLength
                          }
                      }
                  }
                : {})
        };
    } finally {
        await live.close();
    }
};

describe('live session replay', () => {
    it(
        'replays one captured play session into two fresh seeded worlds and compares each tick',
        { tags: ['real-data'], timeout: 90_000 },
        async () => {
            const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
            const moverAuth = new OfflineAuthProvider({ displayName: 'ReplayMover', identity: MOVER_ID });
            const observerAuth = new OfflineAuthProvider({ displayName: 'ReplayObserver', identity: OBSERVER_ID });

            try {
                const captured = await captureSession(moverAuth, observerAuth);
                expect(captured.movement).toHaveLength(MOVEMENT_COUNT);

                const first = await replaySession(PORT_BASE + 1, moverAuth, observerAuth, captured);
                const second = await replaySession(PORT_BASE + 2, moverAuth, observerAuth, captured);

                expect(first.finalMoverPosition.x).toBeGreaterThan(captured.moverStart.x + 0.8);
                expect(first.moveEvents).toBe(MOVEMENT_COUNT);
                expect(second.moveEvents).toBe(MOVEMENT_COUNT);
                expect(second.finalMoverPosition).toEqual(first.finalMoverPosition);
                expect(second.worldSeries).toEqual(first.worldSeries);
                expect(second.packetSeries).toEqual(first.packetSeries);
                expect(first.packetSeries.some(([, digest]) => digest !== null)).toBe(true);
            } finally {
                random.mockRestore();
                vi.unstubAllEnvs();
            }
        }
    );

    it(
        'reports replay instrumentation cost against an unrecorded baseline',
        { tags: ['real-data', 'performance'], timeout: 120_000 },
        async () => {
            const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
            const moverAuth = new OfflineAuthProvider({ displayName: 'ReplayMover', identity: MOVER_ID });
            const observerAuth = new OfflineAuthProvider({ displayName: 'ReplayObserver', identity: OBSERVER_ID });

            try {
                const captured = await captureSession(moverAuth, observerAuth);
                const baseline = await replaySession(PORT_BASE + 3, moverAuth, observerAuth, captured, {
                    measureCosts: true,
                    instrumented: false,
                    serializableRandom: true
                });
                const instrumented = await replaySession(PORT_BASE + 4, moverAuth, observerAuth, captured, {
                    measureCosts: true,
                    instrumented: true,
                    serializableRandom: true
                });
                if (baseline.measurements === undefined || instrumented.measurements === undefined) {
                    throw new Error('Replay cost measurements are missing');
                }
                if (baseline.finalWorldDigest !== instrumented.finalWorldDigest) {
                    throw new Error('Instrumented replay changed the fixed workload world digest');
                }
                expect(baseline.moveEvents).toBe(MOVEMENT_COUNT);
                expect(instrumented.moveEvents).toBe(MOVEMENT_COUNT);
                expect(baseline.finalMoverPosition).toEqual(instrumented.finalMoverPosition);
                expect(instrumented.packetSeries.some(([, digest]) => digest !== null)).toBe(true);
                expect(instrumented.measurements.worldDigestCalls).toBe(instrumented.measurements.sampleTicks);
                expect(instrumented.measurements.checkpoint?.serializedBytes).toBeGreaterThan(0);
                expect(instrumented.measurements.storage.inputTraceSerializedBytes).toBeGreaterThan(0);
                expect(instrumented.measurements.storage.outboundJsonRecordBytes).toBeGreaterThan(0);

                const baselineCpuUsPerTick =
                    (baseline.measurements.tickCpuMs * 1000) / baseline.measurements.sampleTicks;
                const instrumentedCpuUsPerTick =
                    (instrumented.measurements.tickCpuMs * 1000) / instrumented.measurements.sampleTicks;
                process.stdout.write(
                    `session-replay-costs ${JSON.stringify({
                        workload: { seed: SESSION_SEED, movementPackets: MOVEMENT_COUNT },
                        baseline: {
                            tickCpuUs: Number(baselineCpuUsPerTick.toFixed(2)),
                            tickWallMs: Number(baseline.measurements.tickWallMs.toFixed(3))
                        },
                        instrumented: {
                            tickCpuUs: Number(instrumentedCpuUsPerTick.toFixed(2)),
                            tickWallMs: Number(instrumented.measurements.tickWallMs.toFixed(3)),
                            worldDigestCpuUsPerTick: Number(
                                (
                                    (instrumented.measurements.worldDigestCpuMs * 1000) /
                                    instrumented.measurements.sampleTicks
                                ).toFixed(2)
                            ),
                            worldDigestWallUsPerTick: Number(
                                (
                                    (instrumented.measurements.worldDigestWallMs * 1000) /
                                    instrumented.measurements.sampleTicks
                                ).toFixed(2)
                            ),
                            outboundDigestCpuUsPerTick: Number(
                                (
                                    (instrumented.measurements.outboundDigestCpuMs * 1000) /
                                    instrumented.measurements.sampleTicks
                                ).toFixed(2)
                            ),
                            outboundDigestWallUsPerTick: Number(
                                (
                                    (instrumented.measurements.outboundDigestWallMs * 1000) /
                                    instrumented.measurements.sampleTicks
                                ).toFixed(2)
                            ),
                            checkpointCpuMs: Number((instrumented.measurements.checkpoint?.cpuMs ?? 0).toFixed(3)),
                            checkpointWallMs: Number((instrumented.measurements.checkpoint?.wallMs ?? 0).toFixed(3)),
                            storage: instrumented.measurements.storage
                        },
                        instrumentationTickCpuOverheadUsPerTick: Number(
                            (instrumentedCpuUsPerTick - baselineCpuUsPerTick).toFixed(2)
                        )
                    })}\n`
                );
            } finally {
                random.mockRestore();
                vi.unstubAllEnvs();
            }
        }
    );
});
