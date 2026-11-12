import { describe, expect, it } from 'vitest';

import { stub } from '../testing/stub.test.helper';
import type { World } from './World';
import { WorldMessages } from './WorldMessages';

/** A world whose unit runs the message as it is. */
const world = stub<World>({ runInputNow: (apply) => apply() });

describe('world messages', () => {
    it('leaves a message filed during a step for the next one', () => {
        const messages = new WorldMessages(() => {});
        const applied: string[] = [];
        messages.send(world, () => {
            applied.push('first');
            messages.send(world, () => void applied.push('second'));
        });

        expect(messages.admit()).toBe(1);
        expect(applied).toEqual(['first']);
        expect(messages.size).toBe(1);
    });

    it('drains the messages its messages file', () => {
        const messages = new WorldMessages(() => {});
        const applied: string[] = [];
        messages.send(world, () => {
            applied.push('first');
            messages.send(world, () => void applied.push('second'));
        });

        expect(messages.drain()).toBe(2);
        expect(applied).toEqual(['first', 'second']);
        expect(messages.size).toBe(0);
    });

    it('stops draining a message that files itself for ever, and reports it', () => {
        const reported: string[] = [];
        const messages = new WorldMessages((error) => void reported.push(String(error)));
        let applies = 0;
        const again = (): undefined => {
            applies += 1;
            messages.send(world, again);
        };
        messages.send(world, again);

        messages.drain();

        // Bounded, whatever the bound is: it stopped, with the message it gave up on still filed.
        expect(applies).toBeGreaterThan(2);
        expect(messages.size).toBe(1);
        expect(reported).toHaveLength(1);
        expect(reported[0]).toMatch(/1 world message\(s\) were still being filed after \d+ passes/);
    });
});
