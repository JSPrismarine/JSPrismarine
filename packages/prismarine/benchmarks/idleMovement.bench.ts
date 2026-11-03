/** Measures the per-input cost of an idle player's unchanged pose. */
import { Vector3 } from '@jsprismarine/math';

import type Player from '../src/Player';
import type Server from '../src/Server';
import type PlayerSession from '../src/network/PlayerSession';
import { applyClientMovement } from '../src/network/handler/MovePlayerHandler';
import { stub } from '../src/testing/stub.test.helper';
import { Position } from '../src/world/Position';
import type { World } from '../src/world/World';

const argumentsAfterScript = process.argv.slice(2).filter((argument) => argument !== '--');
const ITERATIONS = Number.parseInt(argumentsAfterScript[0] ?? '50000', 10);
if (!Number.isSafeInteger(ITERATIONS) || ITERATIONS < 1) throw new RangeError('iterations must be a positive integer');

const world = stub<World>({ getPlayers: () => [], broadcastMove: async () => void movementUpdates++ });
let movementUpdates = 0;
let movementEvents = 0;
let positionWrites = 0;
let groundWrites = 0;
const position = new Vector3(124.25, 68, -91.75);
const player = stub<Player>({
    getName: () => 'idle-player',
    getPosition: () => new Position(position.getX(), position.getY(), position.getZ(), world),
    pitch: 3.5,
    yaw: 165.25,
    headYaw: 164.5,
    isOnGround: () => true,
    getWorld: () => world,
    setPosition: async () => void positionWrites++,
    setOnGround: async () => void groundWrites++
});
const session = stub<PlayerSession>({ getPlayer: () => player });
const server = stub<Server>({ post: () => ++movementEvents });
const movement = { position, pitch: 3.5, yaw: 165.25, headYaw: 164.5, onGround: true };

const started = performance.now();
for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    await applyClientMovement(server, session, movement);
}
const microsecondsPerTick = ((performance.now() - started) * 1000) / ITERATIONS;

if (movementUpdates !== 0 || positionWrites !== 0 || groundWrites !== 0) {
    throw new Error(
        `Idle input caused ${movementUpdates} movement updates, ${positionWrites} position writes, and ${groundWrites} ground writes`
    );
}
if (movementEvents !== ITERATIONS) throw new Error(`Expected ${ITERATIONS} movement events, got ${movementEvents}`);

console.log(
    `iterations=${ITERATIONS}, movement packets/tick=${movementUpdates}, ${microsecondsPerTick.toFixed(2)} µs/tick`
);
