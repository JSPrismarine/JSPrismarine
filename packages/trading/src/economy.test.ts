import { constantRandom, scriptedRandom, seededRandom } from '@jsprismarine/predicates';
import { describe, expect, it } from 'vitest';

import { parseEconomyTradeTable } from './component';
import { Merchant, merchantSnapshotIn } from './economy';
import type { TradeTable } from './tables';
import { parseTradeTable } from './tables';

const tableOf = (file: unknown): TradeTable => parseTradeTable(file, { pack: 'test' })!;

/** One tier per experience step, each holding one trade that costs emeralds. */
const FARMER = tableOf({
    tiers: [
        {
            total_exp_required: 0,
            groups: [
                {
                    num_to_select: 1,
                    trades: [
                        {
                            wants: [{ item: 'minecraft:emerald', quantity: 20, price_multiplier: 0.05 }],
                            gives: [{ item: 'minecraft:bread', quantity: 6 }],
                            trader_exp: 2,
                            max_uses: 12,
                            reward_exp: true
                        }
                    ]
                }
            ]
        },
        {
            total_exp_required: 10,
            groups: [
                {
                    num_to_select: 1,
                    trades: [
                        {
                            wants: [{ item: 'minecraft:emerald', quantity: 3, price_multiplier: 0.05 }],
                            gives: [{ item: 'minecraft:pumpkin_pie', quantity: 4 }],
                            trader_exp: 5,
                            max_uses: 12,
                            reward_exp: false
                        }
                    ]
                }
            ]
        }
    ]
});

const merchantOf = (overrides: Partial<ConstructorParameters<typeof Merchant>[0]> = {}) =>
    new Merchant({ table: FARMER, random: seededRandom(17), ...overrides });

describe('stock and uses', () => {
    it('starts with every offer available', () => {
        const merchant = merchantOf();

        expect(merchant.offers()).toHaveLength(1);
        expect(merchant.offers()[0]?.available).toBe(true);
        expect(merchant.offers()[0]?.uses).toBe(0);
    });

    it('counts a use and locks the trade at `max_uses`', () => {
        const merchant = merchantOf();
        for (let use = 0; use < 12; use += 1) expect(merchant.trade(0).traded).toBe(true);

        expect(merchant.offers()[0]?.uses).toBe(12);
        expect(merchant.offers()[0]?.available).toBe(false);
        expect(merchant.trade(0)).toMatchObject({ traded: false, refusal: 'outOfStock' });
    });

    it('refuses an offer that does not exist', () => {
        expect(merchantOf().trade(9)).toMatchObject({ traded: false, refusal: 'noSuchOffer' });
    });

    it('restocks every offer when the trader resupplies', () => {
        const merchant = merchantOf();
        merchant.trade(0);
        merchant.resupply();

        expect(merchant.offers()[0]?.uses).toBe(0);
        expect(merchant.offers()[0]?.available).toBe(true);
    });
});

describe('experience and levels', () => {
    it("earns the trade's `trader_exp` and starts at level one", () => {
        const merchant = merchantOf();

        expect(merchant.level).toBe(1);
        expect(merchant.trade(0).traderExperience).toBe(2);
        expect(merchant.experience).toBe(2);
    });

    it('unlocks the next tier and adds its offers once the experience arrives', () => {
        const merchant = merchantOf();
        const results = Array.from({ length: 5 }, () => merchant.trade(0));

        expect(merchant.experience).toBe(10);
        expect(merchant.level).toBe(2);
        expect(results.at(-1)?.leveledUp).toBe(true);
        expect(merchant.offers()).toHaveLength(2);
        expect(merchant.offers()[1]?.offer.gives[0]?.item).toBe('minecraft:pumpkin_pie');
    });

    it('keeps the offers it already had when it levels up', () => {
        const merchant = merchantOf();
        const first = merchant.offers()[0]?.offer;
        for (let use = 0; use < 5; use += 1) merchant.trade(0);

        expect(merchant.offers()[0]?.offer).toEqual(first);
        expect(merchant.offers()[0]?.uses).toBe(5);
    });

    it('starts at the level a saved experience total already earned', () => {
        expect(merchantOf({ experience: 10 }).level).toBe(2);
        expect(merchantOf({ experience: 10 }).offers()).toHaveLength(2);
    });

    it('gives the player experience only when `reward_exp` is set', () => {
        const merchant = merchantOf({ experience: 10, playerRewardExp: { min: 4, max: 4 } });

        expect(merchant.trade(0).playerExperience).toBe(4);
        expect(merchant.trade(1).playerExperience).toBe(0);
    });
});

describe('demand', () => {
    it('leaves the price alone inside one stock cycle', () => {
        const merchant = merchantOf();
        merchant.trade(0);

        expect(merchant.offers()[0]?.wants[0]?.count).toBe(20);
    });

    it('raises the price at the restock that follows a sold-out trade', () => {
        const merchant = merchantOf();
        for (let use = 0; use < 12; use += 1) merchant.trade(0);
        merchant.resupply();

        // demand 0 + 12 - (12 - 12) = 12, so 20 + floor(20 * 12 * 0.05) = 32.
        expect(merchant.offers()[0]?.demand).toBe(12);
        expect(merchant.offers()[0]?.wants[0]?.count).toBe(32);
    });

    it('lets demand fall again when nobody trades', () => {
        const merchant = merchantOf();
        for (let use = 0; use < 12; use += 1) merchant.trade(0);
        merchant.resupply();
        merchant.resupply();

        expect(merchant.offers()[0]?.demand).toBe(0);
        expect(merchant.offers()[0]?.wants[0]?.count).toBe(20);
    });
});

describe('the discounts', () => {
    const settings = parseEconomyTradeTable({ cured_discount: [-25, -20], max_cured_discount: [-25, -20] });

    it('takes nothing off for a player with no standing', () => {
        expect(merchantOf({ settings }).offers({})[0]?.wants[0]?.count).toBe(20);
    });

    it('applies the cured discount drawn inside its range', () => {
        const merchant = merchantOf({ settings, random: constantRandom(0) });

        // 20 - 25 floors at one item.
        expect(merchant.offers({ curedByPlayer: true })[0]?.wants[0]?.count).toBe(1);
    });

    it('draws the cured discount once, so the price does not flicker', () => {
        const merchant = merchantOf({ settings, random: scriptedRandom([0, 0.9]) });
        const first = merchant.offers({ curedByPlayer: true })[0]?.wants[0]?.count;

        expect(merchant.offers({ curedByPlayer: true })[0]?.wants[0]?.count).toBe(first);
    });

    it('adds the nearby cured discount per villager and caps the total', () => {
        const merchant = merchantOf({ settings });

        expect(merchant.offers({ nearbyCured: 1 })[0]?.wants[0]?.count).toBe(1);
        expect(merchant.offers({ nearbyCured: 100 })[0]?.wants[0]?.count).toBe(1);
    });

    it('applies the hero of the village discount per level', () => {
        const cheap = tableOf({
            tiers: [
                {
                    total_exp_required: 0,
                    groups: [
                        {
                            num_to_select: 1,
                            trades: [
                                {
                                    wants: [{ item: 'minecraft:emerald', quantity: 20 }],
                                    gives: [{ item: 'minecraft:bread', quantity: 1 }]
                                }
                            ]
                        }
                    ]
                }
            ]
        });
        const merchant = new Merchant({ table: cheap, random: seededRandom(1), settings });

        expect(merchant.offers({ heroOfTheVillage: 1 })[0]?.wants[0]?.count).toBe(16);
        expect(merchant.offers({ heroOfTheVillage: 3 })[0]?.wants[0]?.count).toBe(8);
    });

    it('discounts only the first want, which is the emerald side of a vanilla trade', () => {
        const twoWants = tableOf({
            tiers: [
                {
                    total_exp_required: 0,
                    groups: [
                        {
                            num_to_select: 1,
                            trades: [
                                {
                                    wants: [
                                        { item: 'minecraft:emerald', quantity: 20 },
                                        { item: 'minecraft:book', quantity: 1 }
                                    ],
                                    gives: [{ item: 'minecraft:enchanted_book', quantity: 1 }]
                                }
                            ]
                        }
                    ]
                }
            ]
        });
        const merchant = new Merchant({ table: twoWants, random: seededRandom(1), settings });
        const wants = merchant.offers({ heroOfTheVillage: 2 })[0]?.wants;

        expect(wants?.[0]?.count).toBe(12);
        expect(wants?.[1]?.count).toBe(1);
    });
});

describe('a whole trading session', () => {
    it('runs the economy from a new villager to a leveled, restocked, discounted one', () => {
        const merchant = merchantOf({
            settings: parseEconomyTradeTable({ cured_discount: [-25, -20] }),
            random: seededRandom(2024)
        });

        expect(merchant.level).toBe(1);
        expect(merchant.offers()).toHaveLength(1);

        // Sell out the first offer.
        let playerExperience = 0;
        for (let use = 0; use < 12; use += 1) playerExperience += merchant.trade(0).playerExperience;

        expect(merchant.experience).toBe(24);
        expect(merchant.level).toBe(2);
        expect(merchant.offers()).toHaveLength(2);
        expect(playerExperience).toBeGreaterThan(0);
        expect(merchant.offers()[0]?.available).toBe(false);
        expect(merchant.offers()[1]?.available).toBe(true);

        merchant.resupply();

        expect(merchant.offers()[0]?.available).toBe(true);
        expect(merchant.offers()[0]?.wants[0]?.count).toBeGreaterThan(20);

        const heroPrice = merchant.offers({ heroOfTheVillage: 5 })[0]?.wants[0]?.count ?? 0;
        const basePrice = merchant.offers()[0]?.wants[0]?.count ?? 0;

        expect(heroPrice).toBe(basePrice - 20);
    });
});

describe('a saved Merchant', () => {
    /** The offers as a player sees them, without the table objects, for comparing two traders. */
    const seen = (merchant: Merchant) =>
        merchant.offers({ nearbyCured: 1 }).map((entry) => ({
            gives: entry.offer.gives.map((stack) => `${stack.count} ${stack.item}`),
            wants: entry.wants.map((stack) => `${stack.count} ${stack.item}`),
            uses: entry.uses,
            demand: entry.demand,
            available: entry.available
        }));

    const traded = () => {
        const merchant = new Merchant({ table: FARMER, random: seededRandom(1) });
        for (let round = 0; round < 3; round += 1) merchant.trade(0);
        merchant.resupply();
        merchant.trade(0);
        return merchant;
    };

    it('comes back with the offers, uses, demand and experience it left with', () => {
        const merchant = traded();

        const restored = new Merchant({
            table: FARMER,
            random: seededRandom(999),
            snapshot: merchantSnapshotIn(JSON.parse(JSON.stringify(merchant.snapshot())))!
        });

        expect(seen(restored)).toEqual(seen(merchant));
        expect(restored.experience).toBe(merchant.experience);
        expect(restored.level).toBe(merchant.level);
    });

    it('draws nothing again, whatever random source the restored trader is given', () => {
        const merchant = new Merchant({ table: FARMER, random: seededRandom(1) });
        const first = seen(merchant);

        for (const seed of [2, 3, 4]) {
            const restored = new Merchant({ table: FARMER, random: seededRandom(seed), snapshot: merchant.snapshot() });
            expect(seen(restored)).toEqual(first);
        }
    });

    it('keeps the earlier tier when a trade after the restore unlocks the next', () => {
        const merchant = new Merchant({ table: FARMER, random: seededRandom(1) });
        merchant.trade(0);
        const restored = new Merchant({ table: FARMER, random: seededRandom(5), snapshot: merchant.snapshot() });
        const before = seen(restored)[0];

        for (let round = 0; round < 5; round += 1) restored.trade(0);

        expect(restored.level).toBe(2);
        expect(seen(restored)).toHaveLength(2);
        expect(seen(restored)[0]?.gives).toEqual(before?.gives);
    });

    it('generates a tier the save lacks, when the table gained one since', () => {
        const merchant = new Merchant({ table: FARMER, random: seededRandom(1), experience: 0 });
        const snapshot = { ...merchant.snapshot(), experience: 50 };

        const restored = new Merchant({ table: FARMER, random: seededRandom(2), snapshot });

        expect(restored.level).toBe(2);
        expect(seen(restored)).toHaveLength(2);
        expect(seen(restored)[0]).toEqual(seen(merchant)[0]);
    });

    it('keeps the cured discount it drew', () => {
        const merchant = new Merchant({
            table: FARMER,
            random: seededRandom(1),
            settings: parseEconomyTradeTable({ cured_discount: { min: -25, max: -5 } })
        });
        const price = merchant.offers({ curedByPlayer: true })[0]?.wants[0]?.count;

        const restored = new Merchant({
            table: FARMER,
            random: seededRandom(77),
            settings: parseEconomyTradeTable({ cured_discount: { min: -25, max: -5 } }),
            snapshot: merchant.snapshot()
        });

        expect(restored.offers({ curedByPlayer: true })[0]?.wants[0]?.count).toBe(price);
    });

    it('rejects a snapshot that is damaged rather than trading from it', () => {
        const good = JSON.parse(JSON.stringify(traded().snapshot())) as Record<string, unknown>;

        expect(merchantSnapshotIn(good)).toBeDefined();
        expect(merchantSnapshotIn({ ...good, version: 2 })).toBeUndefined();
        expect(merchantSnapshotIn({ ...good, experience: 'lots' })).toBeUndefined();
        expect(merchantSnapshotIn({ ...good, offers: [{ tier: 0 }] })).toBeUndefined();
        expect(merchantSnapshotIn(null)).toBeUndefined();
        expect(merchantSnapshotIn('{}')).toBeUndefined();
    });
});
