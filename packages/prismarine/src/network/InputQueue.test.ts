import { describe, expect, it } from 'vitest';

import { INPUT_ADMISSION_BUDGET_PER_TICK, InputQueue } from './InputQueue';

describe('network', () => {
    describe('InputQueue', () => {
        it('applies nothing until an input step, then everything held, in arrival order', async () => {
            const queue = new InputQueue();
            const applied: number[] = [];
            const held = [1, 2, 3].map((value) =>
                queue.hold(() => {
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
                    void queue.hold(() => {
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
            void queue.hold(() => {
                applied.push('first');
                later = queue.hold(() => {
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
            const failing = queue.hold(() => {
                throw new Error('handler failed');
            });
            const after = queue.hold(() => {
                applied.push('after');
            });

            queue.admit();
            await expect(failing).rejects.toThrow('handler failed');
            await after;
            expect(applied).toEqual(['after']);
        });

        it('defaults to the per-tick budget', async () => {
            const queue = new InputQueue();
            for (let index = 0; index < INPUT_ADMISSION_BUDGET_PER_TICK + 1; index++) void queue.hold(() => {});

            expect(queue.admit()).toBe(INPUT_ADMISSION_BUDGET_PER_TICK);
            expect(queue.pending).toBe(1);
        });
    });
});
