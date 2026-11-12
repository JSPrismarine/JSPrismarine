/** Measures idle input cost and observer packets through the production movement replicator. */
import { Vector3 } from '@jsprismarine/math';
import type { Logger } from '@jsprismarine/logger';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';

import type { StorePlayerActor } from '../src/entity/data/storePlayers';
import type Server from '../src/Server';
import type { Config } from '../src/config/Config';
import type ClientConnection from '../src/network/ClientConnection';
import type PlayerSession from '../src/network/PlayerSession';
import Codec2193 from '../src/network/codec/Codec2193';
import { NetworkWorldReplicator } from '../src/network/NetworkWorldReplicator';
import { applyClientMovement } from '../src/network/handler/MovePlayerHandler';
import type { MovementContext } from '../src/network/handler/MovePlayerHandler';
import { stub } from '../src/testing/stub.test.helper';
import { Position } from '../src/world/Position';
import type { World } from '../src/world/World';

const argumentsAfterScript = process.argv.slice(2).filter((argument) => argument !== '--');
const ITERATIONS = Number.parseInt(argumentsAfterScript[0] ?? '50000', 10);
if (!Number.isSafeInteger(ITERATIONS) || ITERATIONS < 1) throw new RangeError('iterations must be a positive integer');

const packets: string[] = [];
/** Reads the packets again after a check, which TypeScript would otherwise keep narrowed across awaits. */
const observerPackets = (): readonly string[] => packets;
const frames: Buffer[] = [];
/** The player a session answers with, which the movement handler moves. */
type SessionPlayer = ReturnType<PlayerSession['getPlayer']>;
const sessions: PlayerSession[] = [];
let replicator!: NetworkWorldReplicator;
const world = stub<World>({
    getName: () => 'idle movement benchmark',
    getViewers: () => sessions,
    broadcastMove: async (entity) => replicator.entityMoved(entity)
});
const pose = {
    position: new Position(124.25, 68, -91.75, world),
    pitch: 3.5,
    yaw: 165.25,
    headYaw: 164.5,
    onGround: true
};
/** The moving player's actor, which is what replication shows. */
const moverBody = stub<StorePlayerActor>({
    getName: () => 'moving-player',
    getRuntimeId: () => 42n,
    getPosition: () => pose.position,
    getWorld: () => world,
    isOnGround: () => pose.onGround
});
const mover = stub<SessionPlayer>({
    getName: () => 'moving-player',
    getRuntimeId: () => 42n,
    getPosition: () => pose.position,
    isOnGround: () => pose.onGround
});
// Replication reads live player angles; static stub fields would hide the updated pose.
for (const shown of [mover, moverBody]) {
    Object.defineProperties(shown, {
        pitch: { get: () => pose.pitch },
        yaw: { get: () => pose.yaw },
        headYaw: { get: () => pose.headYaw }
    });
}
const connection = stub<ClientConnection>({
    codec: Codec2193,
    compressionAlgorithm: PacketCompressionAlgorithm.ZLIB,
    compressionThreshold: 256,
    sendSharedBatch: async (content, batchPackets) => {
        frames.push(content);
        packets.push(...batchPackets.map((packet) => packet.getName()));
    },
    sendSharedBatchAsync: async (batch) => {
        const encoded = await batch;
        frames.push(encoded.content);
        packets.push(...encoded.packets.map((packet) => packet.getName()));
    }
});
const moverSession = stub<PlayerSession>({
    getPlayer: () => mover,
    getActor: () => moverBody,
    shown: () => moverBody,
    getWorld: () => world,
    getViewPosition: () => pose.position,
    setPlayerPosition: async ({ position, pitch, yaw, headYaw }) => {
        pose.position = new Position(position.getX(), position.getY(), position.getZ(), world);
        pose.pitch = pitch ?? pose.pitch;
        pose.yaw = yaw ?? pose.yaw;
        pose.headYaw = headYaw ?? pose.headYaw;
        await world.broadcastMove(moverBody);
    },
    setOnGround: (onGround) => void (pose.onGround = onGround),
    tracks: () => false,
    getConnection: () => connection
});
const observerSession = stub<PlayerSession>({
    tracks: (runtimeId: bigint) => runtimeId === mover.getRuntimeId(),
    getConnection: () => connection
});
sessions.push(moverSession, observerSession);

const config = stub<Config>({
    getPacketCompressionLevel: () => 1,
    getPacketCompressionThreshold: () => 256
});
const server = stub<Server>({
    getConfig: () => config,
    getLogger: () =>
        stub<Logger>({
            error: (error: unknown) => {
                throw error;
            }
        }),
    post: () => 0
});
replicator = new NetworkWorldReplicator(world, server);
const session = stub<PlayerSession>({ getPlayer: () => mover, holdsMovementForTeleport: () => false });
/** The sends one movement hands its input step, awaited before the next as the step does. */
const outputs: Promise<void>[] = [];
const context: MovementContext = {
    session,
    log: server.getLogger(),
    services: { events: { post: () => 0, emit: async () => {} } },
    step: {
        tick: 0,
        output: (send) => void outputs.push(send)
    }
};
const movement = {
    position: new Vector3(124.25, 68, -91.75),
    pitch: 3.5,
    yaw: 165.25,
    headYaw: 164.5,
    onGround: true
};

const started = performance.now();
for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    applyClientMovement(context, movement);
    await Promise.all(outputs.splice(0));
    await replicator.flushMovement();
}
const microsecondsPerTick = ((performance.now() - started) * 1000) / ITERATIONS;

if (packets.length !== 0 || frames.length !== 0) {
    throw new Error(`Idle input sent ${packets.length} observer packets in ${frames.length} frames`);
}

applyClientMovement(context, { ...movement, position: new Vector3(125.25, 68, -91.75) });
await Promise.all(outputs.splice(0));
await replicator.flushMovement();
const changedPose = observerPackets();
if (changedPose.length !== 1 || changedPose[0] !== 'MoveActorAbsolutePacket') {
    throw new Error(`Changed pose sent ${changedPose.length} unexpected observer packets: ${changedPose.join(', ')}`);
}

console.log(
    `iterations=${ITERATIONS}, observer movement packets/tick=0, changed-pose packets=${packets.length}, ${microsecondsPerTick.toFixed(2)} µs/tick`
);
