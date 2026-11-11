/**
 * Measures queued movement lookup and checks that all viewers get the same packet stream.
 *
 * Run with `pnpm --filter @jsprismarine/prismarine run bench:runtime-id-fanout`.
 */
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import MoveActorAbsolutePacket from '@jsprismarine/protocol/packet/MoveActorAbsolutePacket';
import { stub } from '../src/testing/stub.test.helper';
import { Position } from '../src/world/Position';
import type { World } from '../src/world/World';
import PlayerSession from '../src/network/PlayerSession';

/** What a session queues a move of. */
type MovedActor = Parameters<PlayerSession['queueMoveActor']>[0];

const VIEWER_COUNT = 20;
const ENTITY_COUNT = 30;
const WARMUP_TICKS = 20;
const MEASURED_TICKS = 100;
const world = stub<World>({ getName: () => 'runtime id fanout benchmark' });

const coordinates = Array.from({ length: ENTITY_COUNT }, (_, index) => ({ x: index, y: 64, z: -index }));
const entities = coordinates.map((position, index) =>
    stub<MovedActor>({
        getRuntimeId: () => BigInt(index + 1),
        getPosition: () => new Position(position.x, position.y, position.z, world),
        isOnGround: () => true,
        pitch: 0,
        yaw: 0,
        headYaw: 0
    })
);

const createViewer = () => {
    const batches: Buffer[][] = [];
    const connection = {
        flushOutboundPackets: async () => {},
        sendPackets: (packets: readonly MoveActorAbsolutePacket[]) => {
            batches.push(
                packets.map((packet) => {
                    packet.encode();
                    return Buffer.from(packet.getBuffer());
                })
            );
        }
    };
    const session: PlayerSession = Object.assign(Object.create(PlayerSession.prototype), {
        connection,
        queuedMoves: new Map<number, MoveActorAbsolutePacket>()
    });
    return { session, batches };
};

const viewers = Array.from({ length: VIEWER_COUNT }, createViewer);

const tick = async (index: number): Promise<void> => {
    for (const [entityIndex, position] of coordinates.entries()) {
        position.x += (index + entityIndex) % 2 === 0 ? 0.25 : -0.125;
    }

    for (const { session } of viewers) {
        for (const entity of entities) session.queueMoveActor(entity);
    }
    await Promise.all(viewers.map(({ session }) => session.flushQueuedMoves()));
};

for (let index = 0; index < WARMUP_TICKS; index++) await tick(index);
for (const { batches } of viewers) batches.length = 0;

const started = performance.now();
for (let index = 0; index < MEASURED_TICKS; index++) await tick(index + WARMUP_TICKS);
const microsecondsPerTick = ((performance.now() - started) * 1000) / MEASURED_TICKS;

const viewerDigests = viewers.map(({ batches }) => {
    const hash = createHash('sha256');
    for (const packetBytes of batches.flat()) {
        const packet = new MoveActorAbsolutePacket(packetBytes);
        packet.decode();
        const position = packet.position;
        hash.update(
            `${packet.runtimeEntityId}:${position.getX()},${position.getY()},${position.getZ()}:` +
                `${packet.flags}:${packet.pitch},${packet.yaw},${packet.headYaw}\n`
        );
    }
    return hash.digest('hex');
});

if (new Set(viewerDigests).size !== 1) throw new Error('Viewers decoded different movement streams');

console.log(
    JSON.stringify({
        benchmark: 'runtime-id-movement-fanout',
        viewers: VIEWER_COUNT,
        entities: ENTITY_COUNT,
        ticks: MEASURED_TICKS,
        microsecondsPerTick,
        viewerDigests
    })
);
