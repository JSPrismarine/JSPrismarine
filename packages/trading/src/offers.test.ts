import type { FilterContext, FilterEntityView } from '@jsprismarine/entities';
import { scriptedRandom, seededRandom } from '@jsprismarine/predicates';
import { describe, expect, it } from 'vitest';

import type { TradeEnchanting } from './functions';
import type { OfferGenerationOptions } from './offers';
import { generateOffers, unlockedTierCount } from './offers';
import type { TradeTable } from './tables';
import { parseTradeTable } from './tables';

const tableOf = (file: unknown): TradeTable => parseTradeTable(file, { pack: 'test' })!;

const trade = (want: string, give: string, extra: Record<string, unknown> = {}) => ({
    wants: [{ item: want, quantity: 1 }],
    gives: [{ item: give, quantity: 1 }],
    ...extra
});

const FIVE_TIERS = tableOf({
    tiers: [0, 10, 70, 150, 250].map((exp, index) => ({
        total_exp_required: exp,
        groups: [{ num_to_select: 1, trades: [trade('minecraft:emerald', `minecraft:tier_${index}`)] }]
    }))
});

const optionsFor = (overrides: Partial<OfferGenerationOptions> = {}): OfferGenerationOptions => ({
    table: FIVE_TIERS,
    random: seededRandom(42),
    ...overrides
});

describe('tier unlocking', () => {
    it('always offers the first tier', () => {
        expect(unlockedTierCount(FIVE_TIERS, 0)).toBe(1);
    });

    it('unlocks a tier once the trader has its experience', () => {
        expect(unlockedTierCount(FIVE_TIERS, 10)).toBe(2);
        expect(unlockedTierCount(FIVE_TIERS, 150)).toBe(4);
        expect(unlockedTierCount(FIVE_TIERS, 250)).toBe(5);
    });

    it('stops checking at the first tier the trader cannot reach', () => {
        const outOfOrder = tableOf({
            tiers: [
                { total_exp_required: 0, groups: [] },
                { total_exp_required: 500, groups: [] },
                { total_exp_required: 1, groups: [] }
            ]
        });

        expect(unlockedTierCount(outOfOrder, 100)).toBe(1);
    });

    it('generates one offer per unlocked tier', () => {
        expect(generateOffers(optionsFor({ traderExp: 70 }))).toHaveLength(3);
        expect(generateOffers(optionsFor({ traderExp: 70 })).map((offer) => offer.tier)).toEqual([0, 1, 2]);
    });
});

describe('`num_to_select`', () => {
    const group = (numToSelect: number) =>
        tableOf({
            tiers: [
                {
                    total_exp_required: 0,
                    groups: [
                        {
                            num_to_select: numToSelect,
                            trades: [
                                trade('minecraft:emerald', 'minecraft:a'),
                                trade('minecraft:emerald', 'minecraft:b'),
                                trade('minecraft:emerald', 'minecraft:c')
                            ]
                        }
                    ]
                }
            ]
        });

    it('offers exactly the number the group asks for', () => {
        expect(generateOffers(optionsFor({ table: group(2) }))).toHaveLength(2);
    });

    it('offers the whole group for a negative count', () => {
        expect(generateOffers(optionsFor({ table: group(-1) }))).toHaveLength(3);
    });

    it('draws without replacement, so no trade appears twice', () => {
        const names = generateOffers(optionsFor({ table: group(3) })).map((offer) => offer.gives[0]?.item);

        expect(new Set(names).size).toBe(3);
    });

    it('never asks for more than the group holds', () => {
        expect(generateOffers(optionsFor({ table: group(9) }))).toHaveLength(3);
    });
});

describe('determinism', () => {
    const wide = tableOf({
        tiers: [
            {
                total_exp_required: 0,
                groups: [
                    {
                        num_to_select: 2,
                        trades: Array.from({ length: 8 }, (_unused, index) =>
                            trade('minecraft:emerald', `minecraft:item_${index}`)
                        )
                    }
                ]
            }
        ]
    });

    it('gives the same offers for the same seed', () => {
        expect(generateOffers(optionsFor({ table: wide, random: seededRandom(5) }))).toEqual(
            generateOffers(optionsFor({ table: wide, random: seededRandom(5) }))
        );
    });

    it('gives different offers for a different seed', () => {
        const left = generateOffers(optionsFor({ table: wide, random: seededRandom(5) }));
        const right = generateOffers(optionsFor({ table: wide, random: seededRandom(6000) }));

        expect(left).not.toEqual(right);
    });
});

describe('the item grammar at generation time', () => {
    it('draws a quantity inside its range', () => {
        const table = tableOf({
            tiers: [
                {
                    total_exp_required: 0,
                    groups: [
                        {
                            num_to_select: 1,
                            trades: [
                                {
                                    wants: [{ item: 'minecraft:emerald', quantity: { min: 2, max: 4 } }],
                                    gives: [{ item: 'minecraft:bread', quantity: 6 }]
                                }
                            ]
                        }
                    ]
                }
            ]
        });

        for (const seed of [1, 2, 3, 4, 5]) {
            const offer = generateOffers(optionsFor({ table, random: seededRandom(seed) }))[0]!;

            expect(offer.wants[0]?.count).toBeGreaterThanOrEqual(2);
            expect(offer.wants[0]?.count).toBeLessThanOrEqual(4);
            expect(offer.gives[0]?.count).toBe(6);
        }
    });

    it('picks one member of a `choice` list', () => {
        const table = tableOf({
            tiers: [
                {
                    total_exp_required: 0,
                    groups: [
                        {
                            num_to_select: 1,
                            trades: [
                                {
                                    wants: [{ item: 'minecraft:emerald' }],
                                    gives: [
                                        {
                                            choice: [
                                                { item: 'minecraft:white_wool' },
                                                { item: 'minecraft:red_wool' },
                                                { item: 'minecraft:blue_wool' }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]
        });
        const drawn = new Set(
            [1, 2, 3, 4, 5, 6, 7, 8].map(
                (seed) => generateOffers(optionsFor({ table, random: seededRandom(seed) }))[0]?.gives[0]?.item
            )
        );

        expect(drawn.size).toBeGreaterThan(1);
        for (const item of drawn) expect(item).toMatch(/_wool$/);
    });

    it('keeps only the choices whose filters pass', () => {
        const table = tableOf({
            tiers: [
                {
                    total_exp_required: 0,
                    groups: [
                        {
                            num_to_select: 1,
                            trades: [
                                {
                                    wants: [{ item: 'minecraft:emerald' }],
                                    gives: [
                                        {
                                            choice: [
                                                {
                                                    item: 'minecraft:cod',
                                                    filters: {
                                                        test: 'is_mark_variant',
                                                        subject: 'self',
                                                        operator: '=',
                                                        value: 1
                                                    }
                                                },
                                                {
                                                    item: 'minecraft:salmon',
                                                    filters: {
                                                        test: 'is_mark_variant',
                                                        subject: 'self',
                                                        operator: '=',
                                                        value: 2
                                                    }
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]
        });

        const self: FilterEntityView = { measure: (name) => (name === 'is_mark_variant' ? 2 : undefined) };
        const filters: FilterContext = { self };

        for (const seed of [1, 2, 3]) {
            const offer = generateOffers(optionsFor({ table, random: seededRandom(seed), context: { filters } }))[0];

            expect(offer?.gives[0]?.item).toBe('minecraft:salmon');
        }
    });

    it('drops a trade whose slot has no surviving choice and reports it', () => {
        const table = tableOf({
            tiers: [
                {
                    total_exp_required: 0,
                    groups: [
                        {
                            num_to_select: 1,
                            trades: [
                                {
                                    wants: [{ item: 'minecraft:emerald' }],
                                    gives: [
                                        {
                                            choice: [
                                                {
                                                    item: 'minecraft:cod',
                                                    filters: { test: 'is_mark_variant', subject: 'self', value: 1 }
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]
        });
        const codes: string[] = [];
        const self: FilterEntityView = { measure: () => 7 };

        const offers = generateOffers(
            optionsFor({ table, context: { filters: { self } }, report: (code) => codes.push(code) })
        );

        expect(offers).toEqual([]);
        expect(codes).toContain('trading.noChoiceSurvived');
    });
});

describe('the trade item functions', () => {
    const functionTable = (fn: Record<string, unknown>, item = 'minecraft:book') =>
        tableOf({
            tiers: [
                {
                    total_exp_required: 0,
                    groups: [
                        {
                            num_to_select: 1,
                            trades: [
                                {
                                    wants: [{ item: 'minecraft:emerald' }],
                                    gives: [{ item, quantity: 1, functions: [fn] }]
                                }
                            ]
                        }
                    ]
                }
            ]
        });

    it('writes the destination an exploration map names', () => {
        const offer = generateOffers(
            optionsFor({ table: functionTable({ function: 'exploration_map', destination: 'monument' }) })
        )[0];

        expect(offer?.gives[0]?.components.get('minecraft:exploration_map')).toBe('monument');
    });

    it('writes the potion a `set_potion` names', () => {
        const offer = generateOffers(
            optionsFor({ table: functionTable({ function: 'set_potion', id: 'nightvision' }) })
        )[0];

        expect(offer?.gives[0]?.components.get('minecraft:potion')).toBe('nightvision');
    });

    it('draws an auxiliary value inside its range', () => {
        const offer = generateOffers(
            optionsFor({
                table: functionTable({ function: 'random_aux_value', values: { min: 0, max: 5 } }),
                random: scriptedRandom([0.99])
            })
        )[0];

        expect(offer?.gives[0]?.components.get('minecraft:aux_value')).toBe(5);
    });

    it('draws a dye color out of the sixteen', () => {
        const offer = generateOffers(
            optionsFor({ table: functionTable({ function: 'random_dye' }), random: scriptedRandom([0]) })
        )[0];

        expect(offer?.gives[0]?.components.get('minecraft:dye_color')).toBe(0);
    });

    it('reaches the enchantment seam for `enchant_with_levels`', () => {
        const seen: number[] = [];
        const enchanting: TradeEnchanting = {
            enchantWithLevels: (_item, levels) => {
                seen.push(levels);
                return new Map([['minecraft:enchantments', [{ id: 'sharpness', level: 3 }]]]);
            }
        };
        const offer = generateOffers(
            optionsFor({
                table: functionTable(
                    { function: 'enchant_with_levels', treasure: false, levels: { min: 5, max: 19 } },
                    'minecraft:diamond_sword'
                ),
                enchanting
            })
        )[0];

        expect(seen[0]).toBeGreaterThanOrEqual(5);
        expect(seen[0]).toBeLessThanOrEqual(19);
        expect(offer?.gives[0]?.components.get('minecraft:enchantments')).toEqual([{ id: 'sharpness', level: 3 }]);
    });

    it('reports the missing seam and still offers the trade', () => {
        const codes: string[] = [];
        const offers = generateOffers(
            optionsFor({
                table: functionTable({ function: 'enchant_with_levels', levels: { min: 5, max: 19 } }),
                report: (code) => codes.push(code)
            })
        );

        expect(offers).toHaveLength(1);
        expect(codes).toContain('trading.noEnchanter');
    });

    it('prices an enchanted book from the four cost parameters', () => {
        const enchanting: TradeEnchanting = {
            enchantBookForTrading: () => ({ level: 2, components: new Map([['minecraft:enchantments', 'unbreaking']]) })
        };
        // 2 + round(0.5 * (5 + 2 * 10 + 1)) + 2 * 3 = 2 + 13 + 6 = 21.
        const offer = generateOffers(
            optionsFor({
                table: functionTable({
                    function: 'enchant_book_for_trading',
                    base_cost: 2,
                    base_random_cost: 5,
                    per_level_random_cost: 10,
                    per_level_cost: 3
                }),
                random: scriptedRandom([0.5]),
                enchanting
            })
        )[0];

        expect(offer?.wants[0]?.item).toBe('minecraft:emerald');
        expect(offer?.wants[0]?.count).toBe(21);
        expect(offer?.gives[0]?.components.get('minecraft:enchantments')).toBe('unbreaking');
    });

    it('reports a function no registry holds', () => {
        const codes: string[] = [];
        generateOffers(
            optionsFor({
                table: functionTable({ function: 'trader_material_type' }),
                report: (code) => codes.push(code)
            })
        );

        expect(codes).toContain('trading.unknownFunction');
    });
});
