import { describe, expect, it } from 'vitest';

import { EntityTypes } from '../entityTypes';
import type { EntityInstance } from '../entityInstance';
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

/** A random source that replays rolls, then repeats the last. */
const scripted = (rolls: readonly number[]): RandomSource => {
    let index = 0;
    const next = (): number => rolls[Math.min(index++, rolls.length - 1)] ?? 0;
    return { next, nextInt: (bound) => Math.floor(next() * bound) };
};

const spawnWith = (data: unknown, identifier: string, random: RandomSource, parents?: readonly EntityInstance[]) => {
    const types = new EntityTypes();
    types.load([{ data, pack: 'vanilla', path: 'entities/test.json' }]);
    const entity = types.spawn(identifier, { environment: { random }, ...(parents === undefined ? {} : { parents }) });
    entity.applyQueuedEvents();
    return entity;
};

/** The vanilla panda's gene table and the groups its birth events add, under its own identifier. */
const PANDA_GENES = ['lazy', 'worried', 'playful', 'aggressive', 'weak', 'brown'] as const;
const panda = {
    format_version: '1.26.50',
    'minecraft:entity': {
        description: { identifier: 'minecraft:panda' },
        components: {
            'minecraft:genetics': {
                mutation_rate: 0.03125,
                genes: [
                    {
                        name: 'panda_variant',
                        allele_range: { range_min: 0, range_max: 15 },
                        genetic_variants: [
                            { main_allele: 0, birth_event: { event: 'minecraft:panda_lazy', target: 'self' } },
                            { main_allele: 1, birth_event: { event: 'minecraft:panda_worried', target: 'self' } },
                            { main_allele: 2, birth_event: { event: 'minecraft:panda_playful', target: 'self' } },
                            { main_allele: 3, birth_event: { event: 'minecraft:panda_aggressive', target: 'self' } },
                            {
                                both_allele: { range_min: 4, range_max: 7 },
                                birth_event: { event: 'minecraft:panda_weak', target: 'self' }
                            },
                            {
                                both_allele: { range_min: 8, range_max: 9 },
                                birth_event: { event: 'minecraft:panda_brown', target: 'self' }
                            }
                        ]
                    }
                ]
            }
        },
        component_groups: Object.fromEntries(PANDA_GENES.map((gene) => [gene, { 'minecraft:is_shaking': {} }])),
        events: Object.fromEntries(
            PANDA_GENES.map((gene) => [`minecraft:panda_${gene}`, { add: { component_groups: [gene] } }])
        )
    }
};

const spawnPanda = (random: RandomSource, parents?: readonly EntityInstance[]) =>
    spawnWith(panda, 'minecraft:panda', random, parents);

const pandaGeneOf = (entity: EntityInstance): string =>
    PANDA_GENES.find((gene) => entity.activeComponentGroups().includes(gene)) ?? 'normal';

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

    it("draws a spawned panda's genes from Java's Panda.Gene.getRandom table", () => {
        // Java: 0 lazy, 1 worried, 2 playful, 4 aggressive, below 9 weak, below 11 brown, else normal.
        const java = ['lazy', 'worried', 'playful', 'weak', 'aggressive', 'weak', 'weak', 'weak', 'weak'];
        java.push('brown', 'brown', 'normal', 'normal', 'normal', 'normal', 'normal');
        const drawn = java.map((_, draw) => pandaGeneOf(spawnPanda(scripted([(draw + 0.5) / 16]))));
        expect(drawn).toEqual(java);
    });

    it("passes a panda's alleles on from its parents, one from each", () => {
        // Each parent's main and hidden allele show which parent the child drew from.
        const lazy = spawnPanda(scripted([0.5 / 16]));
        const brown = spawnPanda(scripted([9.5 / 16]));
        expect([pandaGeneOf(lazy), pandaGeneOf(brown)]).toEqual(['lazy', 'brown']);

        // nextBoolean picks the order, then each parent's main or hidden allele; no mutation.
        // Mother first: brown's allele is the child's main and lazy's its hidden, and a recessive
        // main gene over a different hidden one shows as normal.
        expect(pandaGeneOf(spawnPanda(scripted([0.9, 0.1, 0.1, 0.9, 0.9]), [lazy, brown]))).toBe('normal');
        // Father first: lazy is dominant.
        expect(pandaGeneOf(spawnPanda(scripted([0.1, 0.1, 0.1, 0.9, 0.9]), [lazy, brown]))).toBe('lazy');
        // Two brown alleles show brown.
        expect(pandaGeneOf(spawnPanda(scripted([0.1, 0.1, 0.1, 0.9, 0.9]), [brown, brown]))).toBe('brown');
    });

    it("mutates an inherited panda allele on the definition's mutation rate", () => {
        const lazy = spawnPanda(scripted([0.5 / 16]));
        // Order, two picks, then a mutation roll under 1/32 that redraws the main allele as worried.
        const child = spawnPanda(scripted([0.1, 0.1, 0.1, 0.01, 1.5 / 16, 0.9]), [lazy, lazy]);
        expect(pandaGeneOf(child)).toBe('worried');
    });

    it("gives a kid its picked parent's scream, as Java's Goat.getBreedOffspring does", () => {
        const screamer = spawnGoat(0);
        const plain = spawnGoat(0.5);
        const kidOf = (rolls: readonly number[]) => {
            const kid = spawnWith(goat, 'test:goat', scripted(rolls), [screamer, plain]);
            return kid.activeComponentGroups().includes('screamer');
        };
        // The first parent is picked and screams; the second is picked and the fresh draw decides.
        expect(kidOf([0.1])).toBe(true);
        expect(kidOf([0.9, 0.5, 0.5])).toBe(false);
        expect(kidOf([0.9, 0, 0])).toBe(true);
    });
});
