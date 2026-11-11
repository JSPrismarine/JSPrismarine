// The slow host patches asynchronous APIs, so it loads before any module that keeps one.
import { SlowHost, nextTurn } from './testing/slowHost.test.helper';
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
import type { ChunkAdmissionRecord } from '@jsprismarine/prismarine/world/ChunkAdmissions';
import LevelDB from '@jsprismarine/prismarine/world/providers/leveldb/LevelDB';
import { MovePlayerPacket, PositionMode } from '@jsprismarine/protocol';
import MoveActorAbsolutePacket from '@jsprismarine/protocol/packet/MoveActorAbsolutePacket';
import UpdateAttributesPacket from '@jsprismarine/protocol/packet/UpdateAttributesPacket';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    deserializeReplayInitialStateManifest,
    restoreReplayInitialStateSnapshot,
    serializeReplayInitialStateManifest
} from '@jsprismarine/prismarine/network/ReplayManifest';

import { reportProgress } from '../../../.test/reportProgress';
import Client from './Client';
import { LoopbackNetwork } from './testing/loopback.test.helper';

interface Position {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

interface CapturedSession {
    readonly moverRuntimeId: bigint;
    readonly moverStart: Position;
    readonly movement: readonly InboundPacketRecord[];
    /** The tick in which the server applied each movement packet. */
    readonly moveTicks: readonly number[];
    readonly replayRandomTickState: number;
    readonly initialStateManifest: Buffer;
    readonly inboundPayloadBytes: number;
    readonly inboundSerializedBytes: number;
    /** Every chunk completion the capture admitted, in admission order. */
    readonly admissions: readonly ChunkAdmissionRecord[];
    /** The server tick at which each client had joined, mover first. */
    readonly joinTicks: readonly number[];
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
    /** Every chunk completion this server admitted, in admission order. */
    readonly admissions: readonly ChunkAdmissionRecord[];
    /** The server tick at which each client had joined, mover first. */
    readonly joinTicks: readonly number[];
    /** Waits until the server and both clients have handled everything already sent. */
    settle(): Promise<void>;
    /**
     * Settles, then runs ticks by hand until the server's next tick is `tick`.
     * @param beforeTick - Called before each tick runs, with that tick, to offer it its inputs.
     */
    stepTo(tick: number, beforeTick?: BeforeTick): Promise<void>;
    close(): Promise<void>;
}

/** Work a run does before a tick, with that tick; awaited before the run settles. */
type BeforeTick = (tick: number) => void | Promise<void>;

const SESSION_SEED = '2847';
const REPLAY_START_TICK = 160;
const SAMPLE_LEAD_TICKS = 2;
const SAMPLE_TRAIL_TICKS = 4;
const MOVEMENT_COUNT = 4;
/** Ticks between two movement packets of the capture. */
const MOVEMENT_INTERVAL_TICKS = 4;
/** More ticks than a join can need. A join that takes longer has failed, whatever the host. */
const MAX_JOIN_TICKS = 120;
/**
 * Only a safety net, never a wait: the replay path sets no timer, so a login that gets here has
 * stalled. It is long so that a loaded host fails on the tick bound above, not on this.
 */
const LOGIN_TIMEOUT_MS = 600_000;
/**
 * Chunk streaming leaves when the chunk scheduler's time budget says, which no tick decides,
 * and ADR 0006 keeps it out of the outbound digest.
 */
const CHUNK_STREAM_PACKETS = new Set(['LevelChunkPacket', 'SubChunkPacket', 'NetworkChunkPublisherUpdatePacket']);
/**
 * Chunks every run asks for from outside a tick, as a read-lane handler would, beyond the view
 * distance so none is loaded yet. They are ready together and enter at one input step.
 */
const BACKGROUND_CHUNKS = 6;
/** Ticks after the first movement at which every run places water and asks for those chunks. */
const WATER_TICK = 0;
const CHUNK_REQUEST_TICK = 1;

/** Sessions still open, so a case that fails or times out still releases its world and folder. */
const openSessions = new Set<LiveSession>();
/** World folders not yet removed, including one whose session failed before it was registered. */
const stateRoots = new Set<string>();
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
        if (CHUNK_STREAM_PACKETS.has(record.packetName)) continue;
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
    moverAuth: OfflineAuthProvider,
    observerAuth: OfflineAuthProvider,
    options: {
        readonly serializableRandom?: boolean;
        readonly recordPackets?: boolean;
        readonly captureInitialState?: boolean;
        readonly initialState?: ReplayInitialStateManifest;
        /** The most chunk completions one input step admits while no trace decides. */
        readonly chunkAdmissionBudget?: number;
        /** A wall clock 3 ms later on every read while the clients join. */
        readonly jumpingJoinClock?: boolean;
    } = {}
): Promise<LiveSession> => {
    // A folder of its own for each run, so a run beside it in another worktree, or a case that
    // failed before it, never shares a LevelDB lock with it.
    const stateRoot = mkdtempSync(path.join(tmpdir(), 'jsprismarine-session-replay-'));
    stateRoots.add(stateRoot);
    vi.stubEnv('JSP_DIR', stateRoot);
    writeFileSync(
        path.join(stateRoot, 'config.json'),
        JSON.stringify({
            'online-mode': false,
            'preload-radius': 0,
            'view-distance': 1,
            'max-players': 2,
            // The harness steps every tick by hand, and generation stays on this thread so a
            // chunk load is I/O the harness can wait for rather than another process's timing.
            'enable-ticking': false,
            'chunk-workers': 0,
            // Chunk streaming stops on a time budget, so a slow tick would start fewer deliveries
            // and a join would take more ticks on a loaded host. With no time limit the counts
            // decide alone: the delivery depth and what each player has queued.
            'chunk-send-budget-ms': Number.MAX_SAFE_INTEGER,
            'enable-query': false,
            worlds: { world: { preset: 'minecraft:flat', provider: 'LevelDB', seed: SESSION_SEED } }
        })
    );

    const network = new LoopbackNetwork();
    const inbound = new PacketTrace();
    const outbound = gatedPacketTrace();
    const server = new Server({
        logger: new Logger('error'),
        config: new Config(),
        headless: true,
        transport: network.transport,
        ...(options.chunkAdmissionBudget === undefined ? {} : { chunkAdmissionBudget: options.chunkAdmissionBudget }),
        ...(options.recordPackets === false
            ? {}
            : { inboundPacketRecorder: inbound, outboundPacketRecorder: outbound.recorder })
    });
    if (!options.serializableRandom) server.setRandom(seededRandom(Number(SESSION_SEED)));
    const admissions: ChunkAdmissionRecord[] = [];
    server.getChunkCompletionQueue().admissions.setRecorder({ record: (record) => void admissions.push(record) });

    const client = (auth: OfflineAuthProvider): Client =>
        new Client({
            host: '127.0.0.1',
            transport: network.client(),
            auth,
            logger: new Logger('error'),
            loginTimeoutMs: LOGIN_TIMEOUT_MS
        });
    const mover = client(moverAuth);
    const observer = client(observerAuth);
    const clients = [mover, observer];
    let world: World | undefined;

    const connections = () => network.connectionIds().flatMap((id) => server.getSessionManager().get(id) ?? []);
    const quiet = (): boolean =>
        server.getKernel().get(networkToken).isInboundSettled() &&
        clients.every((each) => each.getSession().isIdle()) &&
        connections().every((connection) => connection.isOutboundSettled()) &&
        server.getChunkScheduler().isIdle() &&
        (world?.getPendingChunkLoadCount() ?? 0) === 0;
    // A fixed point, not a delay: every frame each side sent has been handled, every packet the
    // server sent has been framed, and no chunk load is still reading or generating. Only then
    // may the next tick run, so a tick sees the same state on a fast host as on a loaded one.
    const settle = async (): Promise<void> => {
        for (;;) {
            await Promise.all(clients.map((each) => each.getSession().settled()));
            await server.getChunkScheduler().settled();
            await Promise.all(connections().map((connection) => connection.settleOutbound()));
            if (!quiet()) {
                // Whatever is left waits on I/O, so let the event loop turn rather than spin.
                await nextTurn();
                continue;
            }
            // The outbound flush runs from `setImmediate`, and I/O lands between turns of the
            // event loop, so the state is only quiet if it still is after one more turn.
            await nextTurn();
            if (quiet()) return;
        }
    };
    const stepTo = async (tick: number, beforeTick?: BeforeTick): Promise<void> => {
        await settle();
        while (server.getTick() < tick) {
            if (beforeTick !== undefined) {
                await beforeTick(server.getTick());
                // Decoded and held before the tick runs, so its input step finds them.
                await settle();
            }
            // On a slow host, anything still held is work this tick would run ahead of.
            const held = SlowHost.held();
            if (held.length > 0) {
                throw new Error(
                    `Tick ${server.getTick()} would run ahead of work the harness does not wait for: ${held
                        .map((work) => `${work.api} from ${work.origin}`)
                        .join('; ')}`
                );
            }
            await server.advanceTick();
            await settle();
        }
    };
    /** Steps ticks until the client has joined; a join needs chunks, and chunks are sent in ticks. */
    const join = async (each: Client): Promise<void> => {
        let joined = false;
        const seen: string[] = [];
        const onPacket = (packet: { name: string }): void => void seen.push(packet.name);
        each.getSession().on('packet', onPacket);
        const connecting = each.connect().finally(() => {
            joined = true;
        });
        // Read below, after the loop; this keeps an early failure from going unhandled meanwhile.
        connecting.catch(() => {});
        for (let ticks = 0; !joined; ticks++) {
            if (ticks > MAX_JOIN_TICKS)
                throw new Error(
                    `A client did not join within ${MAX_JOIN_TICKS} ticks; the last packets it got: ${seen.slice(-5).join(', ')}`
                );
            await settle();
            if (!joined) await stepTo(server.getTick() + 1);
        }
        each.getSession().off('packet', onPacket);
        await connecting;
    };

    let closed = false;
    const close = async (): Promise<void> => {
        if (closed) return;
        closed = true;
        openSessions.delete(live);
        try {
            mover.disconnect();
            observer.disconnect();
            await server.shutdown({ stayAlive: true });
        } finally {
            rmSync(stateRoot, { recursive: true, force: true });
            stateRoots.delete(stateRoot);
        }
    };
    const joinTicks: number[] = [];
    const live: LiveSession = {
        server,
        get world(): World {
            if (world === undefined) throw new Error('The default world did not load');
            return world;
        },
        inbound,
        outbound,
        admissions,
        joinTicks,
        mover,
        observer,
        settle,
        stepTo,
        close
    };
    openSessions.add(live);

    if (options.initialState !== undefined) {
        const provider = new LevelDB(path.join(stateRoot, 'worlds', 'world'), server);
        await restoreReplayInitialStateSnapshot(provider, options.initialState);
    }
    await server.bootstrap('127.0.0.1', 0);
    // On from here, as the ticker turns it on when its loop starts: a chunk that becomes ready
    // between two stepped ticks waits for the next one's input step. The bootstrap before it
    // has no tick to wait for.
    server.getChunkCompletionQueue().activate();
    if (options.serializableRandom) {
        const randomState = server.getReplayRandomState();
        server.restoreReplayRandomState({
            ...randomState,
            server: { ...randomState.server, state: Number(SESSION_SEED) }
        });
    }
    world = server.getWorldManager().getWorldByName('world') ?? undefined;
    if (world === undefined) throw new Error('The default world did not load');
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
    let now = Date.now();
    const clock = options.jumpingJoinClock ? vi.spyOn(Date, 'now').mockImplementation(() => (now += 3)) : undefined;
    try {
        for (const each of [mover, observer]) {
            await join(each);
            joinTicks.push(server.getTick());
        }
    } finally {
        clock?.mockRestore();
    }

    return initialStateManifest === undefined ? live : { ...live, initialStateManifest };
};

/**
 * What every run does around the captured inputs, at the same ticks after the first movement:
 * water placed in the air near the mover, which flows through block updates and scheduled
 * fluid ticks, and chunks asked for from outside a tick, which enter through the input step.
 *
 * @param firstInputTick - The tick that applies the first movement in this run.
 * @returns The work to run before each tick, and the chunk requests it started.
 */
const scriptedWork = (
    live: LiveSession,
    start: Position,
    firstInputTick: number
): { readonly beforeTick: BeforeTick; readonly requests: Promise<unknown>[] } => {
    const requests: Promise<unknown>[] = [];
    const beforeTick = async (tick: number): Promise<void> => {
        if (tick === firstInputTick + WATER_TICK) {
            await live.world.setBlockByName(
                Math.floor(start.x) + 2,
                Math.floor(start.y) + 1,
                Math.floor(start.z) + 2,
                'minecraft:water'
            );
        }
        if (tick === firstInputTick + CHUNK_REQUEST_TICK) {
            const chunkX = Math.floor(start.x) >> 4;
            const chunkZ = Math.floor(start.z) >> 4;
            for (let index = 0; index < BACKGROUND_CHUNKS; index += 1) {
                requests.push(live.world.getChunk(chunkX + 8 + index, chunkZ, { urgency: 'idle' }));
            }
        }
    };
    return { beforeTick, requests };
};

const captureSession = async (
    moverAuth: OfflineAuthProvider,
    observerAuth: OfflineAuthProvider
): Promise<CapturedSession> => {
    const live = await openSession(moverAuth, observerAuth, {
        captureInitialState: true,
        serializableRandom: true
    });
    const randomTickStateByTick = new Map<number, number>();
    const recordRandomTickState = (event: { getTick(): number }): void => {
        randomTickStateByTick.set(event.getTick(), live.world.getSystems().getRandomTickState());
    };
    const moveTicks: number[] = [];
    const recordMoveTick = (): void => void moveTicks.push(live.server.getTick());
    try {
        const initialStateManifest = live.initialStateManifest;
        if (initialStateManifest === undefined) throw new Error('Replay initial-state manifest was not captured');
        const startGame = live.mover.getStartGame();
        if (startGame === null) throw new Error('Mover did not receive StartGame');
        const moverStart = positionOf(startGame.position);
        const firstSendTick = live.server.getTick() + 4;
        // The first movement is sent before tick `firstSendTick` and applied in its input step.
        const scripted = scriptedWork(live, moverStart, firstSendTick);
        live.server.on('tick', recordRandomTickState);
        live.server.on('playerMove', recordMoveTick);
        for (let index = 0; index < MOVEMENT_COUNT; index += 1) {
            await live.stepTo(firstSendTick + index * MOVEMENT_INTERVAL_TICKS, scripted.beforeTick);
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
            await live.settle();
        }
        // The last packet is held for the next tick's input step, and the replay samples the
        // ticks after it, so run through the whole sample.
        await live.stepTo(live.server.getTick() + SAMPLE_TRAIL_TICKS + 1, scripted.beforeTick);
        await Promise.all(scripted.requests);

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
            moveTicks,
            replayRandomTickState,
            initialStateManifest,
            inboundPayloadBytes: live.inbound.getPayloadBytes(),
            inboundSerializedBytes: live.inbound.serialize().byteLength,
            admissions: [...live.admissions],
            joinTicks: live.joinTicks
        };
    } finally {
        live.server.removeListener('tick', recordRandomTickState);
        live.server.removeListener('playerMove', recordMoveTick);
        await live.close();
    }
};

const replaySession = async (
    moverAuth: OfflineAuthProvider,
    observerAuth: OfflineAuthProvider,
    captured: CapturedSession,
    options: {
        readonly measureCosts?: boolean;
        readonly instrumented?: boolean;
        readonly serializableRandom?: boolean;
        /** The replay's own admission budget, which its trace overrides from the sample on. */
        readonly chunkAdmissionBudget?: number;
        /** A clock a second slower on every read, from the first sampled tick on. */
        readonly jumpingClock?: boolean;
        /** A wall clock 3 ms later on every read while the clients join. */
        readonly jumpingJoinClock?: boolean;
        /** Runs on a {@link SlowHost}, where every asynchronous completion lands late. */
        readonly slowHost?: boolean;
    } = {}
) => {
    const measureCosts = options.measureCosts ?? false;
    const instrumented = options.instrumented ?? true;
    const initialState = deserializeReplayInitialStateManifest(captured.initialStateManifest);
    const heldBefore = SlowHost.heldCount;
    if (options.slowHost) SlowHost.start();
    try {
        return await replayOn(
            await openSession(moverAuth, observerAuth, {
                serializableRandom: options.serializableRandom,
                recordPackets: !measureCosts || instrumented,
                initialState,
                jumpingJoinClock: options.jumpingJoinClock,
                ...(options.chunkAdmissionBudget === undefined
                    ? {}
                    : { chunkAdmissionBudget: options.chunkAdmissionBudget })
            }),
            captured,
            { ...options, measureCosts, instrumented },
            heldBefore
        );
    } finally {
        SlowHost.stop();
    }
};

const replayOn = async (
    live: LiveSession,
    captured: CapturedSession,
    options: Parameters<typeof replaySession>[3] & { readonly measureCosts: boolean; readonly instrumented: boolean },
    heldBefore: number
) => {
    const { measureCosts, instrumented } = options;
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
        const mover = live.world.getViewers().find((session) => session.getName() === 'ReplayMover');
        if (mover === undefined) throw new Error('Replay mover is missing from the world');
        let moveEvents = 0;
        const moveTicks: number[] = [];
        const onMove = (): void => {
            moveEvents += 1;
            moveTicks.push(live.server.getTick());
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
        // From the sample on, the capture's trace decides which chunks each input step admits,
        // whatever this run's own budget or clock would choose.
        const admissionQueue = live.server.getChunkCompletionQueue().admissions;
        admissionQueue.replay({ records: captured.admissions, tickOffset, fromTick: sampleStart });
        const scripted = scriptedWork(live, captured.moverStart, REPLAY_START_TICK);
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

        const onTick = async (event: { getTick(): number }): Promise<void> => {
            const tick = event.getTick();
            if (tick === sampleStart && instrumented) live.outbound.setEnabled(true);
            // Tick events run before world updates, so stop here to exclude the tick after the sample.
            if (measureCosts && instrumented && tick === sampleEnd + 1) live.outbound.setEnabled(false);
            if (measureCosts && tick === sampleStart) {
                measurementStart = { wallMs: performance.now(), cpu: process.cpuUsage() };
            }
            if (tick === sampleStart) {
                // Login and chunk startup are outside the recorded play-phase trace. Restore the
                // captured counter at the segment boundary so their draw counts cannot shift every
                // later Java random-tick position. An unrecorded baseline needs it as much as an
                // instrumented run, or the two would not compare the same simulation.
                live.world.getSystems().restoreRandomTickState(captured.replayRandomTickState);
            }
            if (tick >= sampleStart && tick <= sampleEnd && instrumented) {
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

            if (measureCosts && tick === sampleEnd + 1) {
                if (measurementStart === undefined) throw new Error('Replay cost sample did not start');
                measurementEnd = {
                    wallMs: performance.now(),
                    cpu: process.cpuUsage(measurementStart.cpu)
                };
            }
        };

        expect(live.server.getTick()).toBeLessThan(sampleStart);
        if (live.server.getChunkScheduler().pending > 0) {
            throw new Error('Chunks were still streaming when the sample began; the join needs more ticks');
        }
        // Each record is offered before its tick runs, as a live packet arrives before the tick
        // that applies it: a read-lane record runs at once, and an input-lane one in that tick's
        // input step. Not awaited here, because an input settles only once its tick has run.
        const replayed: Promise<void>[] = [];
        let clock: { mockRestore(): void } | undefined;
        const offerInputs = async (tick: number): Promise<void> => {
            if (options.jumpingClock && tick === sampleStart) {
                let now = performance.now();
                clock = vi.spyOn(performance, 'now').mockImplementation(() => (now += 1000));
            }
            for (const record of recordsByTick.get(tick) ?? []) {
                replayed.push(
                    replayInboundRecord(record, tickOffset).catch((error: unknown) => {
                        replayErrors.push(error instanceof Error ? error.message : String(error));
                    })
                );
            }
            await scripted.beforeTick(tick);
        };
        // The world's change log, counted per sampled tick as each tick seals (ADR 0012).
        const changeLogCosts: [number, Parameters<Parameters<World['onChangeTickCost']>[0]>[0]][] = [];
        const stopCounting = live.world.onChangeTickCost((cost) => {
            const tick = live.server.getTick();
            if (tick >= sampleStart && tick <= sampleEnd) changeLogCosts.push([tick - REPLAY_START_TICK, cost]);
        });
        live.server.on('tick', onTick);
        try {
            // Through the last sampled tick, and for a cost run through the tick after it, whose
            // start ends the measurement.
            await live.stepTo(measureCosts ? sampleEnd + 2 : sampleEnd + 1, offerInputs);
            await Promise.all(replayed);
            await Promise.all(scripted.requests);
        } finally {
            stopCounting();
            clock?.mockRestore();
            live.server.removeListener('tick', onTick);
            live.server.removeListener('playerMove', onMove);
            live.outbound.setEnabled(false);
        }
        const admissionDivergences = admissionQueue.snapshot().divergences;
        const sampledAdmissions = admissionsIn(live.admissions, sampleStart, sampleEnd, -REPLAY_START_TICK);
        const tickElapsedMs = live.server
            .getTickRecorder()
            .between(sampleStart, sampleEnd + 1)
            .map((sample) => sample.elapsedMs);
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
            changeLogCosts,
            sampledAdmissions,
            admissionDivergences,
            capturedAdmissions: admissionsIn(
                captured.admissions,
                sampleStart - tickOffset,
                sampleEnd - tickOffset,
                tickOffset - REPLAY_START_TICK
            ),
            tickElapsedMs,
            joinTicks: live.joinTicks,
            heldCompletions: SlowHost.heldCount - heldBefore,
            moveEvents,
            moveTickOffsets: moveTicks.map((tick) => tick - REPLAY_START_TICK),
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

/**
 * The admissions of a tick range, keyed by tick offset so a capture and its replays compare,
 * with everything that names the chunk and its content.
 */
const admissionsIn = (
    records: readonly ChunkAdmissionRecord[],
    firstTick: number,
    lastTick: number,
    offset: number
): readonly string[] =>
    records
        .filter((record) => record.tick >= firstTick && record.tick <= lastTick)
        .map(
            ({ tick, world, change, x, z, step, digest }) =>
                `${tick + offset} ${step} ${change} ${world} ${x},${z} ${digest ?? '-'}`
        );

/** One replay's per-tick digests, keyed by the tick's offset from the replay's first input. */
interface ReplaySeries {
    readonly worldSeries: readonly (readonly [number, string])[];
    readonly packetSeries: readonly (readonly [number, string | null])[];
}

/**
 * The first tick at which two replays disagree, and on what; undefined when they agree on
 * every tick. Ticks are compared in order, so the report names where the runs split.
 */
const firstDivergence = (first: ReplaySeries, second: ReplaySeries): string | undefined => {
    const ticks = [...new Set([...first.worldSeries, ...second.worldSeries].map(([tick]) => tick))].sort(
        (left, right) => left - right
    );
    const at = <T>(series: readonly (readonly [number, T])[], tick: number): T | undefined =>
        series.find(([each]) => each === tick)?.[1];
    for (const tick of ticks) {
        const world = [at(first.worldSeries, tick), at(second.worldSeries, tick)];
        if (world[0] !== world[1]) return `tick ${tick}: world digest ${world[0]} then ${world[1]}`;
        const packets = [at(first.packetSeries, tick), at(second.packetSeries, tick)];
        if (packets[0] !== packets[1]) return `tick ${tick}: outbound digest ${packets[0]} then ${packets[1]}`;
    }
    return undefined;
};

afterEach(async () => {
    // A case that failed or timed out left its sessions open; close them so the next case
    // starts with no server running and no world folder left behind.
    await Promise.allSettled([...openSessions].map((session) => session.close()));
    for (const stateRoot of stateRoots) rmSync(stateRoot, { recursive: true, force: true });
    stateRoots.clear();
    vi.unstubAllEnvs();
});

describe('live session replay', () => {
    it(
        'replays one captured play session into two fresh seeded worlds and compares each tick, whatever the clock',
        { tags: ['real-data'], timeout: 90_000 },
        async () => {
            const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
            const moverAuth = new OfflineAuthProvider({ displayName: 'ReplayMover', identity: MOVER_ID });
            const observerAuth = new OfflineAuthProvider({ displayName: 'ReplayObserver', identity: OBSERVER_ID });

            try {
                const captured = await captureSession(moverAuth, observerAuth);
                expect(captured.movement).toHaveLength(MOVEMENT_COUNT);

                const first = await replaySession(moverAuth, observerAuth, captured);
                // A host that admits one chunk a step and reads a clock a second slower on every
                // read: its ticks run far behind the clock, and it still replays the same ticks.
                // The clients join on a wall clock 3 ms later on every read, and every asynchronous
                // completion lands late: a stepped tick that ran ahead of any of it fails here.
                const second = await replaySession(moverAuth, observerAuth, captured, {
                    chunkAdmissionBudget: 1,
                    jumpingClock: true,
                    jumpingJoinClock: true,
                    slowHost: true
                });
                expect(second.heldCompletions).toBeGreaterThan(0);
                // Counts alone decide how long a join takes, so the capture and a replay on the
                // same budget join in the same ticks, and the slow host joins in no more ticks
                // than its budget needs.
                expect(first.joinTicks).toEqual(captured.joinTicks);

                expect(first.finalMoverPosition.x).toBeGreaterThan(captured.moverStart.x + 0.8);
                expect(first.moveEvents).toBe(MOVEMENT_COUNT);
                expect(second.moveEvents).toBe(MOVEMENT_COUNT);
                // Capture stamps each input with the tick that applied it, and a replay applies
                // it in that same tick.
                const firstStamp = captured.movement[0]!.tick;
                expect(captured.moveTicks).toEqual(captured.movement.map((record) => record.tick));
                const stamped = captured.movement.map((record) => record.tick - firstStamp);
                expect(first.moveTickOffsets).toEqual(stamped);
                expect(second.moveTickOffsets).toEqual(stamped);
                expect(second.finalMoverPosition).toEqual(first.finalMoverPosition);
                // Every sampled tick has a world digest, and the movement made the server send
                // something, so the comparison below cannot pass by comparing nothing.
                expect(first.worldSeries).toHaveLength(
                    SAMPLE_LEAD_TICKS + (MOVEMENT_COUNT - 1) * MOVEMENT_INTERVAL_TICKS + SAMPLE_TRAIL_TICKS + 1
                );
                expect(first.packetSeries.filter(([, digest]) => digest !== null).length).toBeGreaterThan(0);
                // The water flows: block updates and scheduled fluid ticks change the world on
                // most sampled ticks after it lands.
                const afterWater = first.worldSeries.filter(([tick]) => tick >= WATER_TICK).map(([, digest]) => digest);
                expect(new Set(afterWater).size).toBeGreaterThan(afterWater.length / 2);

                // Both replays admit exactly the chunks the capture admitted, at the same ticks,
                // with the same content, and the background chunks entered at one input step.
                const inputsPerTick = (admissions: readonly string[]): number[] => {
                    const counts = new Map<string, number>();
                    for (const admission of admissions) {
                        const [tick, step] = admission.split(' ');
                        if (step === 'input') counts.set(tick!, (counts.get(tick!) ?? 0) + 1);
                    }
                    return [...counts.values()];
                };
                expect(Math.max(0, ...inputsPerTick(first.capturedAdmissions))).toBeGreaterThanOrEqual(
                    BACKGROUND_CHUNKS
                );
                expect(first.sampledAdmissions).toEqual(first.capturedAdmissions);
                expect(second.sampledAdmissions).toEqual(first.capturedAdmissions);
                expect(first.admissionDivergences).toEqual([]);
                expect(second.admissionDivergences).toEqual([]);
                // The second replay's own budget would have admitted one chunk a step.
                expect(Math.max(0, ...inputsPerTick(second.sampledAdmissions))).toBeGreaterThan(1);
                // Every sampled tick of the second replay took at least a second by its clock.
                expect(second.tickElapsedMs.length).toBe(first.worldSeries.length);
                expect(second.tickElapsedMs.every((elapsedMs) => elapsedMs >= 1000)).toBe(true);
                expect(firstDivergence(first, second)).toBeUndefined();
                // The change log is part of the simulation's output, so both replays log the same
                // entries and bytes in every tick. The figures themselves are reported, not gated.
                expect(second.changeLogCosts).toEqual(first.changeLogCosts);
                const entries = first.changeLogCosts.map(([, cost]) => cost.entries);
                const bytes = first.changeLogCosts.map(([, cost]) => cost.bytes);
                const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
                reportProgress(
                    `change log over ${entries.length} replayed ticks: ${sum(entries)} entries and ${sum(bytes)} bytes, ` +
                        `at most ${Math.max(0, ...entries)} entries and ${Math.max(0, ...bytes)} bytes in one tick`,
                    'Change log cost'
                );
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
                const baseline = await replaySession(moverAuth, observerAuth, captured, {
                    measureCosts: true,
                    instrumented: false,
                    serializableRandom: true
                });
                const instrumented = await replaySession(moverAuth, observerAuth, captured, {
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
