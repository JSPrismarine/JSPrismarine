import { describe, expect, it } from 'vitest';

import { constantRandom, scriptedRandom, seededRandom } from './random';

describe('scriptedRandom', () => {
    it('hands out the scripted floats in order and then repeats them', () => {
        const random = scriptedRandom([0.25, 0.75]);

        expect([random.nextFloat(), random.nextFloat(), random.nextFloat()]).toEqual([0.25, 0.75, 0.25]);
    });

    it('turns the scripted float into an integer below the bound', () => {
        const random = scriptedRandom([0, 0.5, 0.999]);

        expect([random.nextInt(4), random.nextInt(4), random.nextInt(4)]).toEqual([0, 2, 3]);
    });

    it('keeps nextInt inside the bound for a scripted value of exactly one', () => {
        expect(scriptedRandom([1]).nextInt(3)).toBe(2);
    });
});

describe('constantRandom', () => {
    it('always returns the same float', () => {
        const random = constantRandom(0.4);

        expect([random.nextFloat(), random.nextFloat()]).toEqual([0.4, 0.4]);
    });
});

describe('seededRandom', () => {
    it('replays the same sequence for the same seed', () => {
        const first = seededRandom(1234);
        const second = seededRandom(1234);

        expect([first.nextFloat(), first.nextInt(100)]).toEqual([second.nextFloat(), second.nextInt(100)]);
    });

    it('produces a different sequence for a different seed', () => {
        expect(seededRandom(1).nextFloat()).not.toBe(seededRandom(2).nextFloat());
    });

    it('stays inside the unit interval', () => {
        const random = seededRandom(7);

        for (let draw = 0; draw < 1000; draw += 1) {
            const value = random.nextFloat();
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        }
    });

    it('restores the next draws from a JSON round-trip state', () => {
        const random = seededRandom(1234);
        random.nextFloat();
        const state = JSON.parse(JSON.stringify(random.saveState()));
        const expected = [random.nextFloat(), random.nextInt(37)];

        const restored = seededRandom(0);
        restored.restoreState(state);

        expect([restored.nextFloat(), restored.nextInt(37)]).toEqual(expected);
    });

    it('rejects state from an unsupported algorithm or outside the uint32 range', () => {
        const random = seededRandom(0);

        expect(() => random.restoreState({ version: 1, algorithm: 'other', state: 0 })).toThrow(TypeError);
        expect(() => random.restoreState({ version: 1, algorithm: 'mulberry32', state: 0x1_0000_0000 })).toThrow(
            TypeError
        );
    });
});
