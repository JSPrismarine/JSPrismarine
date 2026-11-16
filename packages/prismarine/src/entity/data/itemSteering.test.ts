import { describe, expect, it } from 'vitest';

import { BOOST_TICK_RANGE, ItemSteering, MIN_BOOST_TICKS } from './itemSteering';

describe('ItemSteering', () => {
    it("runs a boost for Java's 140 plus a draw under 841 ticks, and refuses a second one meanwhile", () => {
        const steering = new ItemSteering();
        const bounds: number[] = [];
        expect(steering.boost((bound) => (bounds.push(bound), 10))).toBe(true);
        expect(bounds).toEqual([BOOST_TICK_RANGE]);
        expect(steering.boostTicks).toBe(MIN_BOOST_TICKS + 10);
        expect(steering.boost(() => 0)).toBe(false);

        for (let tick = 0; tick < MIN_BOOST_TICKS + 10; tick += 1) steering.tick();
        expect(steering.boosting).toBe(true);
        steering.tick();
        expect(steering.boosting).toBe(false);
        expect(steering.boost(() => 0)).toBe(true);
    });

    it('speeds the mount up most halfway through the boost', () => {
        const steering = new ItemSteering();
        expect(steering.boostFactor()).toBe(1);
        steering.boost(() => 60);
        for (let tick = 0; tick < 100; tick += 1) steering.tick();
        expect(steering.boostFactor()).toBeCloseTo(2.15, 6);
    });
});
