import type { Diagnostic } from '@jsprismarine/entities';
import { describe, expect, it } from 'vitest';

import { parseTradeTable } from './tables';

const parse = (file: unknown) => {
    const diagnostics: Diagnostic[] = [];
    const table = parseTradeTable(file, {
        pack: 'test',
        path: 'trading/test.json',
        report: (diagnostic) => diagnostics.push(diagnostic)
    });
    return { table, diagnostics };
};

describe('the economy grammar', () => {
    const economy = {
        format_version: '1.26.10',
        tiers: [
            {
                total_exp_required: 0,
                groups: [
                    {
                        num_to_select: 1,
                        trades: [
                            {
                                wants: [{ item: 'minecraft:paper', quantity: 24, price_multiplier: 0.05 }],
                                gives: [{ item: 'minecraft:emerald', quantity: 1 }],
                                trader_exp: 2,
                                max_uses: 16,
                                reward_exp: true
                            }
                        ]
                    }
                ]
            },
            { total_exp_required: 10, groups: [{ num_to_select: -1, trades: [] }] }
        ]
    };

    it('reads the tiers, the groups and the trades', () => {
        const { table, diagnostics } = parse(economy);

        expect(diagnostics).toEqual([]);
        expect(table?.formatVersion).toBe('1.26.10');
        expect(table?.tiers).toHaveLength(2);
        expect(table?.tiers[0]?.totalExpRequired).toBe(0);
        expect(table?.tiers[1]?.totalExpRequired).toBe(10);
        expect(table?.tiers[0]?.groups[0]?.trades).toHaveLength(1);
    });

    it('reads a trade with its economy fields', () => {
        const trade = parse(economy).table?.tiers[0]?.groups[0]?.trades[0];

        expect(trade?.traderExp).toBe(2);
        expect(trade?.maxUses).toBe(16);
        expect(trade?.rewardExp).toBe(true);
        expect(trade?.weight).toBe(1);
        expect(trade?.wants[0]?.choices[0]).toEqual({
            item: 'minecraft:paper',
            quantity: { min: 24, max: 24 },
            priceMultiplier: 0.05,
            functions: []
        });
    });

    it('takes the documented defaults where the schema and the documentation disagree', () => {
        const bare = parse({ tiers: [{ groups: [{ trades: [{ wants: [{ item: 'a' }], gives: [{ item: 'b' }] }] }] }] });
        const trade = bare.table?.tiers[0]?.groups[0]?.trades[0];

        expect(trade?.maxUses).toBe(12);
        expect(trade?.traderExp).toBe(1);
        expect(trade?.rewardExp).toBe(true);
        expect(trade?.wants[0]?.choices[0]?.priceMultiplier).toBe(0.05);
        expect(bare.table?.tiers[0]?.groups[0]?.numToSelect).toBe(1);
    });
});

describe('the legacy grammar', () => {
    it('normalizes a tier that holds its trades directly into one group that selects all of them', () => {
        const { table, diagnostics } = parse({
            tiers: [{ trades: [{ wants: [{ item: 'a' }], gives: [{ item: 'b' }] }] }]
        });

        expect(diagnostics).toEqual([]);
        expect(table?.tiers[0]?.totalExpRequired).toBe(0);
        expect(table?.tiers[0]?.groups).toHaveLength(1);
        expect(table?.tiers[0]?.groups[0]?.numToSelect).toBe(-1);
    });

    it('keeps the groups of a tier that writes both forms', () => {
        const table = parse({
            tiers: [
                {
                    trades: [{ wants: [{ item: 'a' }], gives: [{ item: 'b' }] }],
                    groups: [{ num_to_select: 1, trades: [{ wants: [{ item: 'c' }], gives: [{ item: 'd' }] }] }]
                }
            ]
        }).table;

        expect(table?.tiers[0]?.groups).toHaveLength(2);
    });
});

describe('the trade item grammar', () => {
    const itemOf = (body: unknown) =>
        parse({ tiers: [{ groups: [{ trades: [{ wants: [body], gives: [{ item: 'b' }] }] }] }] }).table?.tiers[0]
            ?.groups[0]?.trades[0]?.wants[0];

    it('reads a plain item as a one-member choice', () => {
        expect(itemOf({ item: 'minecraft:emerald' })?.choices).toHaveLength(1);
    });

    it('reads a `choice` list as its members', () => {
        const slot = itemOf({ choice: [{ item: 'minecraft:white_wool' }, { item: 'minecraft:red_wool' }] });

        expect(slot?.choices.map((item) => item.item)).toEqual(['minecraft:white_wool', 'minecraft:red_wool']);
    });

    it('reads a quantity as a number, as a range and as a bare maximum', () => {
        expect(itemOf({ item: 'a', quantity: 3 })?.choices[0]?.quantity).toEqual({ min: 3, max: 3 });
        expect(itemOf({ item: 'a', quantity: { min: 2, max: 5 } })?.choices[0]?.quantity).toEqual({ min: 2, max: 5 });
        expect(itemOf({ item: 'a', quantity: { max: 5 } })?.choices[0]?.quantity).toEqual({ min: 1, max: 5 });
    });

    it('keeps a function body whole, under its name', () => {
        const item = itemOf({
            item: 'a',
            functions: [{ function: 'enchant_with_levels', treasure: false, levels: { min: 5, max: 19 } }]
        })?.choices[0];

        expect(item?.functions).toEqual([
            {
                name: 'enchant_with_levels',
                body: { function: 'enchant_with_levels', treasure: false, levels: { min: 5, max: 19 } }
            }
        ]);
    });

    it('parses an item filter through the shared filter grammar', () => {
        const item = itemOf({
            item: 'minecraft:filled_map',
            filters: { test: 'in_overworld', subject: 'self', value: true, operator: '=' }
        })?.choices[0];

        expect(item?.filters).toEqual({
            kind: 'test',
            test: 'in_overworld',
            subject: 'self',
            operator: '==',
            value: true
        });
    });
});

describe('what the parser refuses', () => {
    it('refuses a file with no tiers', () => {
        const { table, diagnostics } = parse({ format_version: '1.18.10' });

        expect(table).toBeUndefined();
        expect(diagnostics[0]?.code).toBe('tradeTable.notATradeTable');
    });

    it('drops a trade with no `gives` and reports it', () => {
        const { table, diagnostics } = parse({ tiers: [{ groups: [{ trades: [{ wants: [{ item: 'a' }] }] }] }] });

        expect(table?.tiers[0]?.groups[0]?.trades).toEqual([]);
        expect(diagnostics[0]?.code).toBe('tradeTable.badTrade');
    });

    it('reports a key the grammar does not name', () => {
        const { diagnostics } = parse({
            tiers: [{ groups: [{ trades: [{ wants: [{ item: 'a' }], gives: [{ item: 'b' }], barter: true }] }] }]
        });

        expect(diagnostics[0]?.code).toBe('tradeTable.unknownKey');
        expect(diagnostics[0]?.message).toContain('barter');
    });
});
