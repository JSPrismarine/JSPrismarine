import { describe, expect, it } from 'vitest';

import { INPUT_ADMISSION_BUDGET_PER_TICK, InputQueue } from './InputQueue';

describe('network', () => {
    describe('InputQueue', () => {
        it('applies nothing until an input step, then everything held, in arrival order', async () => {
            const queue = new InputQueue();
            const applied: number[] = [];
            const held = [1, 2, 3].map((value) =>
                queue.hold('a', () => {
                    applied.push(value);
                })
            );
            await Promise.resolve();
            expect(applied).toEqual([]);
            expect(queue.pending).toBe(3);

            expect(queue.admit()).toBe(3);
            await Promise.all(held);
            expect(applied).toEqual([1, 2, 3]);
            expect(queue.pending).toBe(0);
        });

        it('applies at most its budget in a step and keeps the rest in order for the next', async () => {
            const backlogs = [3, 10, 1000];
            for (const backlog of backlogs) {
                const queue = new InputQueue();
                const applied: number[] = [];
                for (let index = 0; index < backlog; index++) {
                    void queue.hold('a', () => {
                        applied.push(index);
                    });
                }

                const steps: number[] = [];
                while (queue.pending > 0) steps.push(queue.admit(4));

                // The same bound whatever the backlog, and nothing lost or reordered.
                expect(Math.max(...steps)).toBeLessThanOrEqual(4);
                expect(steps).toHaveLength(Math.ceil(backlog / 4));
                expect(applied).toEqual(Array.from({ length: backlog }, (_unused, index) => index));
            }
        });

        it('leaves an input held while the step runs for the next step', async () => {
            const queue = new InputQueue();
            const applied: string[] = [];
            let later: Promise<void> | undefined;
            void queue.hold('a', () => {
                applied.push('first');
                later = queue.hold('a', () => {
                    applied.push('later');
                });
            });

            expect(queue.admit()).toBe(1);
            expect(applied).toEqual(['first']);
            expect(queue.admit()).toBe(1);
            await later;
            expect(applied).toEqual(['first', 'later']);
        });

        it('settles a failing input with its error and applies the inputs after it', async () => {
            const queue = new InputQueue();
            const applied: string[] = [];
            const failing = queue.hold('a', () => {
                throw new Error('handler failed');
            });
            const after = queue.hold('a', () => {
                applied.push('after');
            });

            queue.admit();
            await expect(failing).rejects.toThrow('handler failed');
            await after;
            expect(applied).toEqual(['after']);
        });

        it('applies an input when it is held while no input step will come', async () => {
            const queue = new InputQueue(() => false);
            const applied: number[] = [];
            const held = queue.hold('a', () => {
                applied.push(1);
            });

            expect(applied).toEqual([1]);
            expect(queue.pending).toBe(0);
            await held;
        });

        it('holds inputs while an input step will come, and applies them first once none will', async () => {
            let stepped = true;
            const queue = new InputQueue(() => stepped);
            const applied: string[] = [];
            const push = (value: string) => () => {
                applied.push(value);
            };
            void queue.hold('a', push('early'));
            void queue.hold('a', push('earlier step'));
            expect(applied).toEqual([]);
            expect(queue.pending).toBe(2);

            stepped = false;
            await queue.hold('a', push('arrived'));
            expect(applied).toEqual(['early', 'earlier step', 'arrived']);
            expect(queue.pending).toBe(0);
        });

        it('applies an input held by one it applies on arrival after it, not inside it', async () => {
            const queue = new InputQueue(() => false);
            const applied: string[] = [];
            let later: Promise<void> | undefined;
            await queue.hold('a', () => {
                applied.push('first begins');
                later = queue.hold('a', () => {
                    applied.push('later');
                });
                applied.push('first ends');
            });

            await later;
            expect(applied).toEqual(['first begins', 'first ends', 'later']);
        });

        it('defaults to the per-tick budget', async () => {
            const queue = new InputQueue();
            for (let index = 0; index < INPUT_ADMISSION_BUDGET_PER_TICK + 1; index++) void queue.hold('a', () => {});

            expect(queue.admit()).toBe(INPUT_ADMISSION_BUDGET_PER_TICK);
            expect(queue.pending).toBe(1);
        });

        /** Holds one input from `source` that logs `name` when applied. */
        const holdNamed = (queue: InputQueue, applied: string[], source: string, name: string) =>
            queue.hold(source, () => {
                applied.push(name);
            });

        it('applies a lone input from one source in the first step, however much another source holds', () => {
            const queue = new InputQueue();
            const applied: string[] = [];
            for (let index = 0; index < INPUT_ADMISSION_BUDGET_PER_TICK + 100; index++) {
                void holdNamed(queue, applied, 'flood', `flood:${index}`);
            }
            void holdNamed(queue, applied, 'player', 'player');

            expect(queue.admit()).toBe(INPUT_ADMISSION_BUDGET_PER_TICK);
            expect(applied).toContain('player');
            expect(applied.filter((name) => name.startsWith('flood:'))).toHaveLength(
                INPUT_ADMISSION_BUDGET_PER_TICK - 1
            );
            expect(queue.pending).toBe(101);
        });

        it('takes one input from each source in turn, in the order the sources first held one', () => {
            const queue = new InputQueue();
            const applied: string[] = [];
            for (const [source, name] of [
                ['a', 'a1'],
                ['a', 'a2'],
                ['a', 'a3'],
                ['b', 'b1'],
                ['c', 'c1'],
                ['b', 'b2']
            ] as const) {
                void holdNamed(queue, applied, source, name);
            }

            expect(queue.admit()).toBe(6);
            expect(applied).toEqual(['a1', 'b1', 'c1', 'a2', 'b2', 'a3']);
        });

        it("keeps each source's inputs in arrival order across steps, and loses none", () => {
            const queue = new InputQueue();
            const applied: string[] = [];
            const sources = ['a', 'b', 'c'] as const;
            const sent = { a: 0, b: 0, c: 0 };
            // An uneven interleaving: a sends 7, b sends 3, c sends 1, mixed as they arrive.
            for (const source of ['a', 'a', 'b', 'a', 'c', 'a', 'b', 'a', 'a', 'b', 'a'] as const) {
                void holdNamed(queue, applied, source, `${source}${sent[source]++}`);
            }

            const steps: number[] = [];
            while (queue.pending > 0) steps.push(queue.admit(2));

            expect(Math.max(...steps)).toBeLessThanOrEqual(2);
            for (const source of sources) {
                const own = applied.filter((name) => name.startsWith(source));
                expect(own).toEqual(Array.from({ length: sent[source] }, (_unused, index) => `${source}${index}`));
            }
            expect(applied).toHaveLength(11);
        });

        it('starts the next step with the sources a step ran out of budget before', () => {
            const queue = new InputQueue();
            const applied: string[] = [];
            for (let index = 0; index < 5; index++) void holdNamed(queue, applied, 'a', `a${index}`);
            void holdNamed(queue, applied, 'b', 'b0');
            void holdNamed(queue, applied, 'c', 'c0');

            // a was served when the budget ran out, so b and c go first in the next step.
            expect(queue.admit(1)).toBe(1);
            expect(queue.admit(1)).toBe(1);
            expect(queue.admit(1)).toBe(1);
            expect(applied).toEqual(['a0', 'b0', 'c0']);
        });

        it('applies a step again in the same order when its inputs are held in the order it applied them', () => {
            // What a replay does: it holds a tick's recorded inputs, in the order the capture
            // applied them, before that tick's step.
            const live = new InputQueue();
            const capture: [string, string][] = [];
            const arrivals = ['a', 'a', 'a', 'b', 'c', 'b', 'a', 'c', 'c', 'c'];
            const sent = new Map<string, number>();
            for (const source of arrivals) {
                const name = `${source}${sent.get(source) ?? 0}`;
                sent.set(source, (sent.get(source) ?? 0) + 1);
                void live.hold(source, () => void capture.push([source, name]));
            }

            const replayedSteps: string[][] = [];
            const capturedSteps: string[][] = [];
            const replay = new InputQueue();
            while (live.pending > 0) {
                const start = capture.length;
                live.admit(4);
                const step = capture.slice(start);
                capturedSteps.push(step.map(([, name]) => name));

                const replayed: string[] = [];
                for (const [source, name] of step) void replay.hold(source, () => void replayed.push(name));
                replay.admit(4);
                replayedSteps.push(replayed);
            }

            expect(replayedSteps).toEqual(capturedSteps);
        });
    });
});
