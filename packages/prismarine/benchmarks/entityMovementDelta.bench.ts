/** Compares compressed MoveActorAbsolute and MoveActorDelta batches over a fixed movement trace. */
import { createHash } from 'node:crypto';

import { Vector3 } from '@jsprismarine/math';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { BatchCodec, DEFAULT_COMPRESSION_LEVEL } from '@jsprismarine/protocol';
import type { ProtocolCodec } from '@jsprismarine/protocol';
import MoveActorAbsolutePacket from '@jsprismarine/protocol/packet/MoveActorAbsolutePacket';
import MoveActorDeltaPacket from '@jsprismarine/protocol/packet/MoveActorDeltaPacket';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import type { EntityPosition } from '@jsprismarine/entities';

import { singleDimension } from '../src/content/world/adapter';
import type {
    ContentBlock,
    ContentEntity,
    ContentItemDrop,
    ContentPosition,
    ContentTickScheduler,
    RandomSource,
    ServerWorldAdapter
} from '../src/content/world/adapter';
import { buildServerContent } from '../src/content/ServerContent';
import type { ServerContent } from '../src/content/ServerContent';
import { entityContentGroups } from '../src/entity/contentAdapter';
import type { DataEntity } from '../src/entity/data/DataEntity';
import { EntityRuntime } from '../src/entity/data/EntityRuntime';
import type { ContentItemEntity, EntityHostFacts, EntityWorldFacts } from '../src/entity/data/host';
import { toPacketCompressionLevel, toPacketCompressionThreshold } from '../src/config/Config';
import Codec2193 from '../src/network/codec/Codec2193';
import Codec2225 from '../src/network/codec/Codec2225';
import { encodePacketBatch } from '../src/network/encodePacketBatch';

const TICKS = 100;
const FARM_MOBS = 128;
const VIEWERS_PER_CODEC = 10;
const FLOOR_Y = 63;
const COMPRESSION_LEVEL = toPacketCompressionLevel(DEFAULT_COMPRESSION_LEVEL);
const COMPRESSION_THRESHOLD = toPacketCompressionThreshold(undefined);
const codecs: Array<{ readonly protocol: number; readonly codec: ProtocolCodec }> = [
    { protocol: 2193, codec: Codec2193 },
    { protocol: 2225, codec: Codec2225 }
];

interface Pose {
    readonly runtimeEntityId: bigint;
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly pitch: number;
    readonly yaw: number;
    readonly headYaw: number;
    readonly onGround: boolean;
}

interface PoseUpdate {
    readonly tick: number;
    readonly pose: Pose;
}

interface MovementScenario {
    readonly name: string;
    readonly initial: readonly Pose[];
    readonly updates: readonly PoseUpdate[];
}

const seededRandom = (seed: number): RandomSource => {
    let state = seed >>> 0 || 1;
    const next = () => {
        state ^= state << 13;
        state >>>= 0;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        return state / 0x1_0000_0000;
    };
    return { nextFloat: next, nextInt: (bound) => (bound <= 0 ? 0 : Math.floor(next() * bound)) };
};

const keyOf = (at: ContentPosition): string => `${at.x},${at.y},${at.z}`;

const ticks: ContentTickScheduler = { schedule: () => undefined, isScheduled: () => false, runsThisTick: () => false };

/** Builds the same flat, deterministic world used by the entity AI benchmarks. */
const movementRuntime = (seed: number, players: number) => {
    const random = seededRandom(seed);
    const placed = new Map<string, ContentBlock>();
    let gameTick = 0;
    const world: EntityWorldFacts = {
        level: {
            dimension: 'minecraft:overworld',
            minY: -64,
            maxY: 320,
            hasSkyLight: true,
            seaLevel: 62,
            seed: BigInt(seed),
            gameTime: () => gameTick,
            dayTime: () => 0,
            difficulty: () => 'normal',
            weather: () => 'clear',
            isRainingAt: () => false,
            spawnPosition: () => ({ x: 0, y: FLOOR_Y + 1, z: 0 }),
            gameRule: () => undefined
        },
        blocks: {
            get: (at) =>
                placed.get(keyOf(at)) ?? {
                    identifier: at.y > FLOOR_Y ? 'minecraft:air' : 'minecraft:stone',
                    states: {}
                },
            set: (at, block) => {
                placed.set(keyOf(at), block);
            },
            notifyNeighbors: () => undefined,
            data: () => undefined,
            setData: () => undefined,
            light: (at) => (at.y > FLOOR_Y ? 15 : 0),
            power: () => 0,
            isLoaded: () => true,
            surfaceY: () => FLOOR_Y + 1,
            biome: () => 'minecraft:plains',
            biomeTags: () => ['minecraft:plains']
        },
        effects: { playSound: () => undefined, spawnParticle: () => undefined, emitGameEvent: () => undefined },
        random
    };
    const movingPlayers: ContentEntity[] = Array.from({ length: players }, (_unused, index) => ({
        id: 100_000 + index,
        identifier: 'minecraft:player',
        position: { x: 0, y: FLOOR_Y + 1, z: 0 }
    }));
    const drops = new Map<number, ContentItemEntity>();
    let nextDropId = 1;
    const host: EntityHostFacts = {
        players: () => movingPlayers,
        drop: (position, item: ContentItemDrop) => {
            drops.set(nextDropId, { id: nextDropId, position, item });
            nextDropId++;
        },
        items: () => [...drops.values()],
        takeItem: (id) => {
            const found = drops.get(id);
            drops.delete(id);
            return found?.item;
        },
        hurt: () => undefined,
        mobEventActive: () => false
    };

    let content: ServerContent | undefined;
    const runtime = new EntityRuntime({
        content: () => {
            if (content === undefined) throw new Error('the runtime was read before the content was built');
            return content;
        },
        world,
        host,
        report: () => undefined
    });
    const adapter: ServerWorldAdapter = { ...world, ticks, ...entityContentGroups(runtime) };
    content = buildServerContent({ world: singleDimension(adapter) });

    const walkPlayers = (tick: number): void => {
        for (let index = 0; index < movingPlayers.length; index++) {
            const angle = tick / 40 + (index * 2 * Math.PI) / Math.max(players, 1);
            movingPlayers[index] = {
                ...movingPlayers[index]!,
                position: {
                    x: Math.cos(angle) * 4,
                    y: FLOOR_Y + 1,
                    z: Math.sin(angle) * 4
                }
            };
        }
    };

    return {
        runtime,
        setTick: (tick: number) => {
            gameTick = tick;
            walkPlayers(tick);
        }
    };
};

const poseOf = (entity: DataEntity): Pose => ({
    runtimeEntityId: BigInt(entity.id),
    x: entity.position.x,
    y: entity.position.y,
    z: entity.position.z,
    pitch: entity.body.pitch,
    yaw: entity.body.yaw,
    headYaw: entity.body.yaw,
    onGround: entity.conditions.has('on_ground')
});

const samePose = (left: Pose, right: Pose): boolean =>
    left.x === right.x &&
    left.y === right.y &&
    left.z === right.z &&
    left.pitch === right.pitch &&
    left.yaw === right.yaw &&
    left.headYaw === right.headYaw &&
    left.onGround === right.onGround;

/** Records runtime movement once, then every encoding replays that exact tick sequence. */
const recordMovementScenario = (
    name: string,
    seed: number,
    players: number,
    actors: readonly { readonly identifier: string; readonly position: EntityPosition }[]
): MovementScenario => {
    const { runtime, setTick } = movementRuntime(seed, players);
    for (const actor of actors) runtime.spawn(actor.identifier, actor.position);

    const initial = runtime.entities().toArray().map(poseOf);
    const previous = new Map(initial.map((state) => [state.runtimeEntityId, state]));
    const updates: PoseUpdate[] = [];
    for (let tick = 1; tick <= TICKS; tick++) {
        setTick(tick);
        runtime.tick(tick);
        for (const entity of runtime.entities().toArray()) {
            const current = poseOf(entity);
            const prior = previous.get(current.runtimeEntityId);
            if (prior === undefined || !samePose(current, prior)) {
                updates.push({ tick, pose: current });
                previous.set(current.runtimeEntityId, current);
            }
        }
    }

    if (runtime.entities().toArray().length !== actors.length) {
        throw new Error(
            `${name} movement recording expected ${actors.length} mobs, found ${runtime.entities().toArray().length}`
        );
    }

    return { name, initial, updates };
};

/** Captures walking, idle, and farm traffic from seeded vanilla behavior definitions. */
const recordMovementTrace = (): MovementScenario[] => {
    const farmActors = Array.from({ length: FARM_MOBS }, (_unused, index) => ({
        identifier: index % 2 === 0 ? 'minecraft:sheep' : 'minecraft:cow',
        position: {
            x: (index % 16) * 1.5 + 0.5,
            y: FLOOR_Y + 1,
            z: Math.floor(index / 16) * 1.5 + 0.5
        }
    }));

    return [
        recordMovementScenario('walking', 71, 2, [
            { identifier: 'minecraft:zombie', position: { x: 0.5, y: FLOOR_Y + 1, z: 0.5 } }
        ]),
        recordMovementScenario('idle', 72, 0, [
            { identifier: 'minecraft:cow', position: { x: 512.5, y: FLOOR_Y + 1, z: 512.5 } }
        ]),
        recordMovementScenario('farm-mobs', 73, 0, farmActors)
    ];
};

const absolutePacket = (state: Pose): MoveActorAbsolutePacket => {
    const packet = new MoveActorAbsolutePacket();
    packet.runtimeEntityId = state.runtimeEntityId;
    packet.position = new Vector3(state.x, state.y, state.z);
    packet.pitch = state.pitch;
    packet.yaw = state.yaw;
    packet.headYaw = state.headYaw;
    packet.flags = state.onGround ? MoveActorAbsolutePacket.FLAG_ON_GROUND : 0;
    return packet;
};

const deltaPacket = (state: Pose, previous: Pose): MoveActorDeltaPacket => {
    const packet = new MoveActorDeltaPacket();
    packet.runtimeEntityId = state.runtimeEntityId;
    if (state.x !== previous.x) packet.positionX = state.x;
    if (state.y !== previous.y) packet.positionY = state.y;
    if (state.z !== previous.z) packet.positionZ = state.z;
    if (state.pitch !== previous.pitch) packet.pitch = state.pitch;
    if (state.yaw !== previous.yaw) packet.yaw = state.yaw;
    if (state.headYaw !== previous.headYaw) packet.headYaw = state.headYaw;
    packet.isOnGround = state.onGround;
    packet.ticks = 1n;
    return packet;
};

const encodeTrace = (scenario: MovementScenario, codec: ProtocolCodec, format: 'absolute' | 'delta'): Buffer[] => {
    const previous = new Map(scenario.initial.map((state) => [state.runtimeEntityId, state]));
    const batches: Buffer[] = [];
    let cursor = 0;

    while (cursor < scenario.updates.length) {
        const tick = scenario.updates[cursor]!.tick;
        const packets: NetworkPacket<unknown>[] = [];
        while (cursor < scenario.updates.length && scenario.updates[cursor]!.tick === tick) {
            const state = scenario.updates[cursor++]!.pose;
            const prior = previous.get(state.runtimeEntityId);
            if (prior === undefined) throw new Error(`No initial pose for runtime id ${state.runtimeEntityId}`);

            packets.push(format === 'absolute' ? absolutePacket(state) : deltaPacket(state, prior));
            previous.set(state.runtimeEntityId, state);
        }

        batches.push(
            encodePacketBatch(packets, codec, {
                compressionLevel: COMPRESSION_LEVEL,
                compressionThreshold: COMPRESSION_THRESHOLD
            }).content
        );
    }

    return batches;
};

const digestDecoded = (batches: readonly Buffer[]): string => {
    const hash = createHash('sha256');
    const decoder = BatchCodec.compressed({
        algorithm: PacketCompressionAlgorithm.ZLIB,
        level: COMPRESSION_LEVEL,
        threshold: COMPRESSION_THRESHOLD
    });
    for (const batch of batches) {
        for (const packet of decoder.decode(batch)) hash.update(packet);
    }
    return hash.digest('hex');
};

const measuredBytes = (scenario: MovementScenario) => {
    const bytes: Record<'absolute' | 'deltaPerEntity' | 'deltaPerViewer', Record<number, number>> = {
        absolute: {},
        deltaPerEntity: {},
        deltaPerViewer: {}
    };
    const digests: Record<'absolute' | 'deltaPerEntity' | 'deltaPerViewer', Record<number, string>> = {
        absolute: {},
        deltaPerEntity: {},
        deltaPerViewer: {}
    };

    for (const { protocol, codec } of codecs) {
        const absoluteBatches = encodeTrace(scenario, codec, 'absolute');
        const entityDeltaBatches = encodeTrace(scenario, codec, 'delta');
        const viewerDeltaBatches = Array.from({ length: VIEWERS_PER_CODEC }, () =>
            encodeTrace(scenario, codec, 'delta')
        );
        const absoluteDigest = digestDecoded(absoluteBatches);
        const entityDeltaDigest = digestDecoded(entityDeltaBatches);
        const viewerDigests = viewerDeltaBatches.map(digestDecoded);

        if (viewerDigests.some((digest) => digest !== entityDeltaDigest)) {
            throw new Error(`${scenario.name} delta streams differ across viewers for protocol ${protocol}`);
        }

        bytes.absolute[protocol] = absoluteBatches.reduce((total, batch) => total + batch.byteLength, 0);
        bytes.deltaPerEntity[protocol] = entityDeltaBatches.reduce((total, batch) => total + batch.byteLength, 0);
        bytes.deltaPerViewer[protocol] = viewerDeltaBatches[0]!.reduce((total, batch) => total + batch.byteLength, 0);
        digests.absolute[protocol] = absoluteDigest;
        digests.deltaPerEntity[protocol] = entityDeltaDigest;
        digests.deltaPerViewer[protocol] = viewerDigests[0]!;
    }

    const networkBytes = (byProtocol: Record<number, number>): number =>
        Object.values(byProtocol).reduce((total, protocolBytes) => total + protocolBytes * VIEWERS_PER_CODEC, 0);

    return {
        updateCount: scenario.updates.length,
        actors: scenario.initial.length,
        compressedBytesPerViewer: bytes,
        compressedBytesAcrossViewers: {
            absolute: networkBytes(bytes.absolute),
            deltaPerEntity: networkBytes(bytes.deltaPerEntity),
            deltaPerViewer: networkBytes(bytes.deltaPerViewer)
        },
        decodedStreamDigests: digests
    };
};

const trace = recordMovementTrace();
const results = trace.map((scenario) => ({ scenario: scenario.name, ...measuredBytes(scenario) }));
const totals = results.reduce(
    (total, result) => ({
        absolute: total.absolute + result.compressedBytesAcrossViewers.absolute,
        deltaPerEntity: total.deltaPerEntity + result.compressedBytesAcrossViewers.deltaPerEntity,
        deltaPerViewer: total.deltaPerViewer + result.compressedBytesAcrossViewers.deltaPerViewer
    }),
    { absolute: 0, deltaPerEntity: 0, deltaPerViewer: 0 }
);

console.log(
    JSON.stringify({
        benchmark: 'entity-movement-delta-compression',
        trace: { ticks: TICKS, farmMobs: FARM_MOBS, viewersPerCodec: VIEWERS_PER_CODEC },
        compression: { algorithm: 'zlib', level: COMPRESSION_LEVEL, threshold: COMPRESSION_THRESHOLD },
        results,
        totals,
        deltaPerEntityChangePercent: ((totals.deltaPerEntity - totals.absolute) / totals.absolute) * 100
    })
);
