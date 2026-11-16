import { describe, expect, it } from 'vitest';

import { javaPotionEffects } from '../../item/potions';
import { boxAt, lingeringCloudData, splashDuration, splashStrength } from './thrownPotion';

describe('a thrown potion', () => {
    it('splashes at full strength on a box it touches and at 1 - distance / 4 out to 4 blocks', () => {
        const potion = boxAt({ x: 0, y: 64, z: 0 }, 0.25, 0.25);
        expect(splashStrength(potion, boxAt({ x: 0.3, y: 64, z: 0 }, 0.9, 1.4))).toBe(1);
        // The cow's near side stands 2 blocks past the potion's.
        expect(splashStrength(potion, boxAt({ x: 2.575, y: 64, z: 0 }, 0.9, 1.4))).toBeCloseTo(0.5);
        expect(splashStrength(potion, boxAt({ x: 4.575, y: 64, z: 0 }, 0.9, 1.4))).toBeUndefined();
    });

    it('rounds a scaled duration and drops one that ends within 20 ticks', () => {
        expect(splashDuration(1800, 0.5, 1)).toBe(900);
        expect(splashDuration(1800, 0.0105, 1)).toBeUndefined();
    });

    it("leaves Java's lingering cloud: radius 3 shrinking over 600 ticks, half a block a use, a 10 tick wait", () => {
        const effects = javaPotionEffects('minecraft:long_poison');
        expect(lingeringCloudData(effects, 0.25)).toEqual({
            radius: 3,
            radius_on_use: -0.5,
            duration: 600,
            wait_time: 10,
            radius_per_tick: -0.005,
            potion_duration_scale: 0.25,
            effects: [{ id: 'minecraft:poison', amplifier: 0, duration: 1800 }]
        });
    });

    it("reads Java's potion table, with nothing for water", () => {
        expect(javaPotionEffects('minecraft:water')).toEqual([]);
        expect(javaPotionEffects('minecraft:strong_turtle_master').map((effect) => effect.amplifier)).toEqual([5, 3]);
    });
});
