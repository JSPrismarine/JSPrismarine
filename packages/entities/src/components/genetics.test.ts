import { describe, expect, it } from 'vitest';

import { EntityTypes } from '../entityTypes';
import type { RandomSource } from '../filterContext';
import { expressedVariant, genetics } from './genetics';

/** A goat's gene as vanilla writes it: alleles 1 and 2 of 1 to 100 make a screamer. */
const goat = {
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier: 'test:goat' },
        components: {
            'minecraft:genetics': {
                mutation_rate: 0.02,
                genes: [
                    {
                        name: 'goat_variant',
                        allele_range: { range_min: 1, range_max: 100 },
                        genetic_variants: [
                            { main_allele: { range_min: 1, range_max: 2 }, birth_event: 'test:born_screamer' },
                            { main_allele: { range_min: 3, range_max: 100 }, birth_event: 'test:born_default' }
                        ]
                    }
                ]
            }
        },
        component_groups: { screamer: { 'minecraft:is_illager_captain': {} }, plain: { 'minecraft:is_shaking': {} } },
        events: {
            'test:born_screamer': { add: { component_groups: ['screamer'] } },
            'test:born_default': { add: { component_groups: ['plain'] } }
        }
    }
};

const spawnGoat = (roll: number) => {
    const types = new EntityTypes();
    types.load([{ data: goat, pack: 'vanilla', path: 'entities/goat.json' }]);
    const random: RandomSource = { next: () => roll, nextInt: (bound) => Math.floor(roll * bound) };
    const entity = types.spawn('test:goat', { environment: { random } });
    entity.applyQueuedEvents();
    return entity;
};

describe('minecraft:genetics', () => {
    it('raises the birth event of the variant the drawn main allele expresses', () => {
        expect(spawnGoat(0).activeComponentGroups()).toContain('screamer');
        expect(spawnGoat(0.5).activeComponentGroups()).toContain('plain');
    });

    it('matches a variant on both alleles when it names both_allele', () => {
        const parsed = genetics.schema({
            genes: [
                {
                    allele_range: { range_min: 0, range_max: 15 },
                    genetic_variants: [{ both_allele: { range_min: 4, range_max: 7 }, birth_event: 'weak' }]
                }
            ]
        });
        if (!parsed.ok) throw new Error('the gene was rejected');
        const [gene] = parsed.value.genes;
        if (gene === undefined) throw new Error('no gene parsed');
        expect(expressedVariant(gene, 5, 6)?.birthEvent?.event).toBe('weak');
        expect(expressedVariant(gene, 5, 9)).toBeUndefined();
    });
});
