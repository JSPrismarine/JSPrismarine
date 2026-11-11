import { describe, expect, it } from 'vitest';

import type { InputStep } from './HandlerContext';
import { orderedParts } from './inputParts';

/** A step that keeps what it is handed, and runs it as the input step does. */
const recordingStep = () => {
    const deferred: (() => Promise<void>)[] = [];
    const outputs: Promise<void>[] = [];
    const step: InputStep = {
        tick: 7,
        output: (send) => void outputs.push(send),
        defer: (work) => void deferred.push(work)
    };
    const settle = async () => {
        for (const work of deferred) await work();
        await Promise.all(outputs);
    };
    return { step, deferred, outputs, settle };
};

describe('orderedParts', () => {
    it('applies every part at once while none defers', () => {
        const { step, deferred } = recordingStep();
        const order: string[] = [];
        const apply = orderedParts(step);

        apply(() => void order.push('move'));
        apply(() => void order.push('jump'));

        expect(order).toEqual(['move', 'jump']);
        expect(deferred).toHaveLength(0);
    });

    it('keeps the parts after one that deferred behind its work', async () => {
        const { step, deferred, settle } = recordingStep();
        const order: string[] = [];
        const apply = orderedParts(step);

        apply(() => void order.push('move'));
        apply((part) => {
            order.push('break starts');
            part.defer(async () => void order.push('break'));
        });
        apply(() => void order.push('place'));

        // The place waits for the break: run at once, it would land first.
        expect(order).toEqual(['move', 'break starts']);
        expect(deferred).toHaveLength(2);

        await settle();
        expect(order).toEqual(['move', 'break starts', 'break', 'place']);
    });

    it('runs the work a deferred part defers before the next part', async () => {
        const { step, deferred, settle } = recordingStep();
        const order: string[] = [];
        const apply = orderedParts(step);

        apply((part) => void part.defer(async () => void order.push('first')));
        apply((part) => {
            order.push('second starts');
            part.defer(async () => void order.push('second'));
        });
        apply(() => void order.push('third'));

        await settle();
        expect(order).toEqual(['first', 'second starts', 'second', 'third']);
        // One piece of work for each part from the first that deferred.
        expect(deferred).toHaveLength(3);
    });

    it('hands every part the step tick and its outputs', async () => {
        const { step, outputs, settle } = recordingStep();
        const ticks: number[] = [];
        const apply = orderedParts(step);

        apply((part) => {
            ticks.push(part.tick);
            part.output(Promise.resolve());
            part.defer(async () => {});
            return undefined;
        });
        apply((part) => {
            ticks.push(part.tick);
            part.output(Promise.resolve());
        });

        await settle();
        expect(ticks).toEqual([7, 7]);
        expect(outputs).toHaveLength(2);
    });
});
