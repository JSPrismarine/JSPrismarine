import { OfflineAuthProvider } from '@jsprismarine/auth';
import { Logger } from '@jsprismarine/logger';
import { Config, Server } from '@jsprismarine/prismarine';
import type { InboundPacketRecord, InboundPacketTrace } from '@jsprismarine/prismarine/network/InboundPacketTrace';
import { InboundPacketTrace as PacketTrace } from '@jsprismarine/prismarine/network/InboundPacketTrace';
import type {
    OutboundPacketRecord,
    OutboundPacketRecorder
} from '@jsprismarine/prismarine/network/OutboundPacketTrace';
import { OutboundPacketTrace } from '@jsprismarine/prismarine/network/OutboundPacketTrace';
import { networkToken } from '@jsprismarine/prismarine/modules/tokens';
import type { World } from '@jsprismarine/prismarine/world/World';
import { MovePlayerPacket, PositionMode } from '@jsprismarine/protocol';
import MoveActorAbsolutePacket from '@jsprismarine/protocol/packet/MoveActorAbsolutePacket';
import UpdateAttributesPacket from '@jsprismarine/protocol/packet/UpdateAttributesPacket';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

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

const openSession = async (
    port: number,
    moverAuth: OfflineAuthProvider,
    observerAuth: OfflineAuthProvider
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
        inboundPacketRecorder: inbound,
        outboundPacketRecorder: outbound.recorder
    });
    server.setRandom(seededRandom(Number(SESSION_SEED)));

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
        await server.bootstrap('127.0.0.1', port);
        const world = server.getWorldManager().getWorldByName('world');
        if (world === null) throw new Error('The default world did not load');
        // This flat fixture is a slime-spawn biome; disable natural spawning before clients join
        // so the digest compares the scripted session rather than unrelated mob spawn timing.
        world.getGameRuleManager().setGameRule('doMobSpawning', false, true);
        await mover.connect();
        await observer.connect();

        return {
            server,
            world,
            inbound,
            outbound,
            mover,
            observer,
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
    const live = await openSession(PORT_BASE, moverAuth, observerAuth);
    try {
        const startGame = live.mover.getStartGame();
        if (startGame === null) throw new Error('Mover did not receive StartGame');
        const moverStart = positionOf(startGame.position);
        const firstSendTick = live.server.getTick() + 4;

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

        return { moverRuntimeId: startGame.runtimeEntityId, moverStart, movement };
    } finally {
        await live.close();
    }
};

const replaySession = async (
    port: number,
    moverAuth: OfflineAuthProvider,
    observerAuth: OfflineAuthProvider,
    captured: CapturedSession
) => {
    const live = await openSession(port, moverAuth, observerAuth);
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

        const moverConnectionId = live.inbound.records().find((record) => record.sequence === 0)?.connectionId;
        if (moverConnectionId === undefined) throw new Error('Replay server captured no accepted client packets');
        const mover = live.world.getPlayers().find((player) => player.getName() === 'ReplayMover');
        if (mover === undefined) throw new Error('Replay mover is missing from the world');
        let moveEvents = 0;
        const onMove = (): void => {
            moveEvents += 1;
        };
        live.server.on('playerMove', onMove);

        // The trace has no session snapshot, so each replay logs in normally first. Re-number this
        // play-phase segment because replay's order and sequence counters begin at the live session.
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
            if (tick === sampleStart) live.outbound.setEnabled(true);
            if (tick >= sampleStart && tick <= sampleEnd) {
                worldDigests.set(tick - REPLAY_START_TICK, live.world.replayStateDigest());
            }

            for (const record of recordsByTick.get(tick) ?? []) {
                try {
                    await replayInboundRecord(record, tickOffset);
                } catch (error: unknown) {
                    replayErrors.push(error instanceof Error ? error.message : String(error));
                }
            }
            if (tick === sampleEnd) resolveComplete();
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

        const worldSeries = Array.from({ length: sampleEnd - sampleStart + 1 }, (_unused, index) => {
            const tick = sampleStart + index;
            const digest = worldDigests.get(tick - REPLAY_START_TICK);
            if (digest === undefined) throw new Error(`No world digest was captured at tick ${tick}`);
            return [tick - REPLAY_START_TICK, digest] as const;
        });
        const packetDigests = replayPacketDigestsByTick(live.outbound.trace, stableRuntimeIds);
        const packetSeries = Array.from({ length: sampleEnd - sampleStart + 1 }, (_unused, index) => {
            const tick = sampleStart + index;
            return [tick - REPLAY_START_TICK, packetDigests.get(tick) ?? null] as const;
        });
        const finalPosition = mover.getPosition();

        return {
            worldSeries,
            packetSeries,
            moveEvents,
            finalMoverPosition: {
                x: finalPosition.getX(),
                y: finalPosition.getY(),
                z: finalPosition.getZ()
            }
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
});
