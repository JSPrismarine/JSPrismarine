import { beforeEach, describe, expect, it } from 'vitest';

import PlayerSession from './PlayerSession';

/**
 * The chunk queue's lifecycle, which is the part of `PlayerSession` a moving player exercises
 * hardest: what gets queued, and - the half that was missing - what gets taken back out.
 *
 * `loadingChunks` and the `ChunkSender` queue are two views of the same thing. Whenever they
 * disagree the scheduler works on chunks nobody wants, or a chunk nobody will ever ask for
 * again leaves a hole in the world.
 */
describe('network', () => {
    describe('PlayerSession chunk queue', () => {
        /**
         * A player at a block position, which is all `needNewChunks` reads.
         *
         * `position` stays a plain field so a test can walk the player by assigning to it;
         * `getPosition` is what the session actually calls, now that a player has a position
         * rather than being one.
         */
        const playerAt = (x: number, z: number, viewDistance = 2) => ({
            position: { x, z },
            viewDistance,
            getPosition() {
                return {
                    getX: () => this.position.x,
                    getZ: () => this.position.z
                };
            }
        });

        const server = {
            getChunkScheduler: () => ({ add: () => {}, remove: () => {} }),
            // Read once in the constructor, to build the session's entity tracker.
            getConfig: () => ({
                getProximityBroadcast: () => true,
                getEntityTrackingHysteresis: () => 2,
                getEntityTrackingInterval: () => 4
            })
        } as any;

        let player: ReturnType<typeof playerAt>;
        let session: PlayerSession;

        beforeEach(() => {
            player = playerAt(0, 0);
            session = new PlayerSession(server, {} as any, player as any);
        });

        it('queues the chunks around the player', async () => {
            await session.needNewChunks();

            expect(session.sender.size).toBeGreaterThan(0);
            expect(session.sender.has(0, 0)).toBe(true);
        });

        it('forgets chunks the player walked away from', async () => {
            // Queued but never drained - the scheduler has a budget, so this is the ordinary
            // case, not a corner one. Walking off used to drop only the bookkeeping, leaving
            // the coordinates in the queue: the scheduler then generated and sent a region
            // the player had already left, ahead of the one in front of them.
            await session.needNewChunks();
            expect(session.sender.has(0, 0)).toBe(true);
            const queuedNear = session.sender.size;

            player.position = { x: 16 * 400, z: 16 * 400 };
            await session.needNewChunks();

            expect(session.sender.has(0, 0)).toBe(false);
            expect(session.sender.has(400, 400)).toBe(true);
            // The old region is gone rather than added to: the queue is the new one's size,
            // not both. Pacing back and forth used to grow it without bound.
            expect(session.sender.size).toBe(queuedNear);
        });

        it('does not requeue a chunk it is already sending', async () => {
            await session.needNewChunks();
            const size = session.sender.size;

            await session.needNewChunks();

            expect(session.sender.size).toBe(size);
        });

        it('drops everything in flight when the chunks are cleared', async () => {
            // A dimension or world change. What is queued belongs to the world being left.
            await session.needNewChunks();
            expect(session.sender.isEmpty()).toBe(false);

            await session.clearChunks();

            expect(session.sender.isEmpty()).toBe(true);
            expect(session.sender.has(0, 0)).toBe(false);
        });

        it('queues afresh for the new world after a clear', async () => {
            await session.needNewChunks();
            await session.clearChunks();

            player.position = { x: 16 * 50, z: 16 * 50 };
            await session.needNewChunks();

            expect(session.sender.has(50, 50)).toBe(true);
            expect(session.sender.has(0, 0)).toBe(false);
        });
    });
});
