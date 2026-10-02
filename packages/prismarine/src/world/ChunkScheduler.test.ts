import { describe, expect, it } from 'vitest';

import ChunkSender from '../network/ChunkSender';
import ChunkScheduler from './ChunkScheduler';
import type { ChunkRecipient } from './ChunkScheduler';

/** A player stand-in: a real queue, and a record of what was delivered. */
const fakeRecipient = (chunks: Array<[number, number]>, costMs = 0, clock?: { now: number }) => {
    const sender = new ChunkSender();
    for (const [x, z] of chunks) sender.enqueue(x, z);

    const delivered: Array<[number, number]> = [];
    const recipient: ChunkRecipient = {
        sender,
        deliver: async (x, z) => {
            delivered.push([x, z]);
            if (clock) clock.now += costMs; // pretend the work took time
        },
        flush: async () => {},
        isConnected: () => true
    };

    return { recipient, delivered, sender };
};

describe('world', () => {
    describe('ChunkScheduler', () => {
        it('sends everything when the budget is generous', async () => {
            const scheduler = new ChunkScheduler(1000);
            const { recipient, delivered } = fakeRecipient([
                [0, 0],
                [1, 0],
                [2, 0]
            ]);
            scheduler.add(recipient);

            const sent = await scheduler.tick();

            expect(sent).toBe(3);
            expect(delivered.length).toBe(3);
        });

        it('stops at the budget and resumes on the next tick', async () => {
            // The property the whole design rests on: a long queue costs a bounded amount
            // per tick instead of running to completion and freezing the server.
            const clock = { now: 0 };
            const scheduler = new ChunkScheduler(5);

            const queued: Array<[number, number]> = [];
            for (let i = 0; i < 100; i++) queued.push([i, 0]);
            const { recipient, delivered } = fakeRecipient(queued, 1, clock);
            scheduler.add(recipient);

            const first = await scheduler.tick(() => clock.now);
            expect(first).toBeLessThanOrEqual(6); // ~5 chunks at 1ms each
            expect(delivered.length).toBe(first);

            clock.now += 50; // next tick
            const second = await scheduler.tick(() => clock.now);
            expect(second).toBeGreaterThan(0);
            expect(delivered.length).toBe(first + second);
        });

        it('shares the budget between players instead of draining one', async () => {
            // Ten players joining together must all start seeing terrain.
            const clock = { now: 0 };
            const scheduler = new ChunkScheduler(10);

            const players = Array.from({ length: 10 }, () =>
                fakeRecipient(
                    Array.from({ length: 50 }, (_, i) => [i, 0] as [number, number]),
                    1,
                    clock
                )
            );
            for (const player of players) scheduler.add(player.recipient);

            await scheduler.tick(() => clock.now);

            const counts = players.map((player) => player.delivered.length);
            expect(Math.min(...counts)).toBeGreaterThan(0); // nobody starved
            expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
        });

        it('carries the rotation across ticks so the same player is not always first', async () => {
            const clock = { now: 0 };
            const scheduler = new ChunkScheduler(2);

            const a = fakeRecipient(
                [
                    [0, 0],
                    [1, 0],
                    [2, 0]
                ],
                1,
                clock
            );
            const b = fakeRecipient(
                [
                    [0, 1],
                    [1, 1],
                    [2, 1]
                ],
                1,
                clock
            );
            scheduler.add(a.recipient);
            scheduler.add(b.recipient);

            await scheduler.tick(() => clock.now);
            clock.now += 50;
            await scheduler.tick(() => clock.now);

            expect(Math.abs(a.delivered.length - b.delivered.length)).toBeLessThanOrEqual(1);
        });

        it('sends each player their own nearest chunks first', async () => {
            const scheduler = new ChunkScheduler(1000);
            const { recipient, delivered, sender } = fakeRecipient([
                [9, 9],
                [1, 1],
                [5, 5]
            ]);
            sender.setCenter(0, 0);
            scheduler.add(recipient);

            await scheduler.tick();

            expect(delivered).toEqual([
                [1, 1],
                [5, 5],
                [9, 9]
            ]);
        });

        it('skips a player who is not connected', async () => {
            const scheduler = new ChunkScheduler(1000);
            const { recipient, delivered } = fakeRecipient([[0, 0]]);
            scheduler.add({ ...recipient, isConnected: () => false });

            expect(await scheduler.tick()).toBe(0);
            expect(delivered).toEqual([]);
        });

        it('keeps a player who is not connected yet, and serves them once they are', async () => {
            // The join race: a session registers itself while the player is still being set
            // up, and only counts as connected at the very end of that. A tick landing in
            // between used to delete them from the rotation for good - nothing re-registers,
            // so that player got no chunks at all and sat in the void.
            const scheduler = new ChunkScheduler(1000);
            const { recipient, delivered } = fakeRecipient([
                [0, 0],
                [1, 0]
            ]);

            let online = false;
            scheduler.add({ ...recipient, isConnected: () => online });

            expect(await scheduler.tick()).toBe(0); // skipped, not dropped
            expect(delivered).toEqual([]);

            online = true;
            expect(await scheduler.tick()).toBe(2);
            expect(delivered.length).toBe(2);
        });

        it('serves a player again after a tick in which they were skipped', async () => {
            const scheduler = new ChunkScheduler(1000);
            const a = fakeRecipient([[0, 0]]);
            const b = fakeRecipient([[1, 1]]);

            let bOnline = false;
            scheduler.add(a.recipient);
            scheduler.add({ ...b.recipient, isConnected: () => bOnline });

            await scheduler.tick();
            expect(a.delivered.length).toBe(1);
            expect(b.delivered.length).toBe(0);

            bOnline = true;
            await scheduler.tick();
            expect(b.delivered.length).toBe(1);
        });

        it('forgets a player only when told to', async () => {
            const scheduler = new ChunkScheduler(1000);
            const { recipient } = fakeRecipient([[0, 0]]);
            scheduler.add(recipient);

            scheduler.remove(recipient);
            expect(await scheduler.tick()).toBe(0);
        });

        it('does nothing, cheaply, when every queue is empty', async () => {
            const scheduler = new ChunkScheduler(1000);
            scheduler.add(fakeRecipient([]).recipient);
            scheduler.add(fakeRecipient([]).recipient);

            expect(await scheduler.tick()).toBe(0);
        });

        it('counts the dispatching work, not only the producing', async () => {
            // The point of the change: a chunk already in memory is nearly free to produce
            // but still costs to serialise and compress. While that happened outside the
            // measured window the scheduler timed almost nothing and overran the tick.
            const clock = { now: 0 };
            const scheduler = new ChunkScheduler(5);

            const sender = new ChunkSender();
            for (let i = 0; i < 100; i++) sender.enqueue(i, 0);

            let produced = 0;
            const recipient: ChunkRecipient = {
                sender,
                // Cheap to produce...
                deliver: async () => {
                    produced++;
                    clock.now += 2; // ...but dispatching inside deliver costs
                },
                flush: async () => {},
                isConnected: () => true
            };
            scheduler.add(recipient);

            await scheduler.tick(() => clock.now);

            // 5 ms of budget at 2 ms a chunk: a handful, not the whole hundred.
            expect(produced).toBeLessThanOrEqual(4);
        });

        it('flushes a partial batch rather than leaving it for the next tick', async () => {
            const scheduler = new ChunkScheduler(1000);
            const sender = new ChunkSender();
            sender.enqueue(0, 0);

            let flushed = 0;
            scheduler.add({
                sender,
                deliver: async () => {},
                flush: async () => {
                    flushed++;
                },
                isConnected: () => true
            });

            await scheduler.tick();
            expect(flushed).toBe(1);
        });

        it('does not flush when it sent nothing', async () => {
            const scheduler = new ChunkScheduler(1000);
            let flushed = 0;
            scheduler.add({
                sender: new ChunkSender(),
                deliver: async () => {},
                flush: async () => {
                    flushed++;
                },
                isConnected: () => true
            });

            await scheduler.tick();
            expect(flushed).toBe(0);
        });

        it('survives a chunk that cannot be produced, and reports it', async () => {
            // This is awaited from the server's tick, and the timer for the next tick is
            // installed only after that await. A rejection escaping here therefore did not
            // cost one chunk, it stopped the server ticking - permanently, while it went on
            // accepting connections.
            const failures: Array<{ x: number; z: number } | undefined> = [];
            const scheduler = new ChunkScheduler(1000, (_error, coord) => failures.push(coord));

            const sender = new ChunkSender();
            sender.enqueue(0, 0);
            scheduler.add({
                sender,
                deliver: async () => {
                    throw new Error('generation failed');
                },
                flush: async () => {},
                isConnected: () => true
            });

            await expect(scheduler.tick()).resolves.toBe(0);
            expect(failures).toEqual([{ x: 0, z: 0 }]);
        });

        it('keeps serving everyone else when one player fails', async () => {
            const scheduler = new ChunkScheduler(1000, () => {});

            const broken = new ChunkSender();
            broken.enqueue(0, 0);
            scheduler.add({
                sender: broken,
                deliver: async () => {
                    throw new Error('generation failed');
                },
                flush: async () => {},
                isConnected: () => true
            });

            const healthy = fakeRecipient([
                [1, 1],
                [2, 2]
            ]);
            scheduler.add(healthy.recipient);

            expect(await scheduler.tick()).toBe(2);
            expect(healthy.delivered.length).toBe(2);
        });

        it('survives a flush that fails', async () => {
            const failures: unknown[] = [];
            const scheduler = new ChunkScheduler(1000, (error) => failures.push(error));

            const sender = new ChunkSender();
            sender.enqueue(0, 0);
            scheduler.add({
                sender,
                deliver: async () => {},
                flush: async () => {
                    throw new Error('compression failed');
                },
                isConnected: () => true
            });

            await expect(scheduler.tick()).resolves.toBe(1);
            expect(failures.length).toBe(1);
        });

        it('sends nothing at all with a zero budget', async () => {
            const scheduler = new ChunkScheduler(0);
            const { recipient, delivered } = fakeRecipient([
                [0, 0],
                [1, 1]
            ]);
            scheduler.add(recipient);

            expect(await scheduler.tick()).toBe(0);
            expect(delivered).toEqual([]);
        });
    });
});
