import { EntityTypes } from '@jsprismarine/entities';
import { describe, expect, it } from 'vitest';

import { javaLlamaStrengthChance, withJavaLlamaStrength } from './javaLlamaStrength';

/** A llama file shaped as the pack writes it: one strength group per value, drawn at spawn. */
const LLAMA = {
    format_version: '1.21.0',
    'minecraft:entity': {
        description: { identifier: 'minecraft:llama', is_spawnable: true, is_summonable: true },
        components: { 'minecraft:health': { value: 15, max: 15 } },
        component_groups: Object.fromEntries(
            [1, 2, 3, 4, 5].map((value) => [`minecraft:strength_${value}`, { 'minecraft:strength': { value, max: 5 } }])
        ),
        events: {
            'minecraft:entity_spawned': {
                sequence: [
                    {
                        randomize: [32, 32, 32, 2, 2].map((weight, index) => ({
                            weight,
                            add: { component_groups: [`minecraft:strength_${index + 1}`] }
                        }))
                    },
                    { randomize: [{ weight: 1, add: { component_groups: [] } }] }
                ]
            }
        }
    }
};

describe('withJavaLlamaStrength', () => {
    it("gives each strength Java's chance, which sums to one", () => {
        expect([1, 2, 3, 4, 5].map((strength) => Number(javaLlamaStrengthChance(strength).toFixed(6)))).toEqual([
            0.328, 0.328, 0.328, 0.008, 0.008
        ]);
        expect([1, 2, 3, 4, 5].reduce((sum, strength) => sum + javaLlamaStrengthChance(strength), 0)).toBeCloseTo(1);
    });

    it("spawns llamas of each strength at Java's rates", () => {
        const types = new EntityTypes();
        types.load([{ data: withJavaLlamaStrength(LLAMA), pack: 'test', path: 'entities/llama.json' }]);
        // A draw that walks the unit interval evenly, so the counts are exactly the weights' shares.
        const samples = 1000;
        const counts = new Map<number, number>();
        for (let sample = 0; sample < samples; sample += 1) {
            const draw = (sample + 0.5) / samples;
            const llama = types.spawn('minecraft:llama', { environment: { random: { next: () => draw } } });
            const strength = llama.componentParams('minecraft:strength');
            const value = typeof strength === 'object' && strength !== null && 'value' in strength ? strength.value : 0;
            if (typeof value === 'number') counts.set(value, (counts.get(value) ?? 0) + 1);
        }
        expect([1, 2, 3, 4, 5].map((strength) => counts.get(strength) ?? 0)).toEqual([328, 328, 328, 8, 8]);
    });

    it('leaves a randomize that draws other groups as it is', () => {
        const events = withJavaLlamaStrength(LLAMA);
        expect(JSON.stringify(events)).toContain('"randomize":[{"weight":1,"add":{"component_groups":[]}}]');
    });
});
