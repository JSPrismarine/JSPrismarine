import { scriptedRandom, seededRandom } from '@jsprismarine/predicates';
import type { RandomSource } from '@jsprismarine/predicates';
import { describe, expect, it } from 'vitest';

import { Merchant } from './economy';
import type { JavaTradeHost, JavaTradeSession, JavaTradeStack, JavaVillagerTrade } from './javaTrades';
import {
    JAVA_VILLAGER_LEVEL_EXPERIENCE,
    javaOfferSource,
    javaTradeOffer,
    javaVillagerTradeSets,
    parseJavaTradeSet,
    parseJavaVillagerTrade
} from './javaTrades';

const trade = (json: Record<string, unknown>): JavaVillagerTrade => {
    const parsed = parseJavaVillagerTrade(json);
    if (parsed === undefined) throw new TypeError('the test trade does not parse');
    return parsed;
};

/** A session over plain stacks: no predicate fails unless named, and the modifier is `modify`. */
const sessionOf = (
    options: {
        readonly random?: RandomSource;
        readonly refused?: readonly string[];
        readonly modify?: (stack: JavaTradeStack) => JavaTradeStack | undefined;
        readonly doubling?: readonly string[];
    } = {}
): JavaTradeSession => ({
    random: options.random ?? seededRandom(1),
    accepts: (id) => !(options.refused ?? []).includes(id),
    given: (_id, entry) => (options.modify === undefined ? entry.gives : options.modify(entry.gives)),
    doublesPrice: (_id, _entry, enchantment) => (options.doubling ?? []).includes(enchantment),
    maxStackSize: (item) => (item === 'minecraft:enchanted_book' ? 1 : 64),
    tradeStackOf: (stack) => ({
        item: stack.id,
        count: stack.count,
        components: new Map(Object.entries(stack.components))
    })
});

describe("Java's villager_trade", () => {
    it("reads the codec's defaults: 4 uses, 1 experience and no discount", () => {
        const parsed = trade({ wants: { id: 'minecraft:wheat', count: 20 }, gives: { id: 'minecraft:emerald' } });

        expect(parsed).toMatchObject({ maxUses: 4, xp: 1, reputationDiscount: 0, gives: { count: 1 } });
        expect(parseJavaTradeSet({ trades: '#minecraft:farmer/level_1', amount: 2 })).toEqual({
            trades: '#minecraft:farmer/level_1',
            amount: 2,
            allowDuplicates: false
        });
    });

    it('adds the cost an enchanting modifier wrote to the price, as VillagerTrade.getOffer does', () => {
        const book = trade({
            wants: { id: 'minecraft:emerald', count: 0 },
            additional_wants: { id: 'minecraft:book' },
            gives: { id: 'minecraft:enchanted_book' },
            max_uses: 12,
            xp: 5,
            reputation_discount: 0.2,
            double_trade_price_enchantments: '#minecraft:double_trade_price'
        });
        const enchanted = (enchantment: string) => (stack: JavaTradeStack) => ({
            ...stack,
            components: {
                'minecraft:stored_enchantments': { levels: { [enchantment]: 1 } },
                'minecraft:additional_trade_cost': 9
            }
        });

        const plain = javaTradeOffer('book', book, 1, sessionOf({ modify: enchanted('minecraft:sharpness') }));
        const doubled = javaTradeOffer(
            'book',
            book,
            1,
            sessionOf({ modify: enchanted('minecraft:mending'), doubling: ['minecraft:mending'] })
        );

        expect(plain?.wants.map((want) => [want.item, want.count])).toEqual([
            ['minecraft:emerald', 9],
            ['minecraft:book', 1]
        ]);
        expect(doubled?.wants[0]?.count).toBe(18);
        // The cost comes off the book, and only the emeralds move with demand.
        expect(plain?.gives[0]?.components.has('minecraft:additional_trade_cost')).toBe(false);
        expect(plain).toMatchObject({ priceMultipliers: [0.2, 0], maxUses: 12, traderExp: 5, rewardExp: true });
    });

    it('makes no offer for a price under one, a discarded stack or a refused predicate', () => {
        const free = trade({ wants: { id: 'minecraft:emerald', count: 0 }, gives: { id: 'minecraft:enchanted_book' } });

        expect(javaTradeOffer('free', free, 0, sessionOf())).toBeUndefined();
        expect(javaTradeOffer('free', free, 0, sessionOf({ modify: () => undefined }))).toBeUndefined();
        const paid = trade({ wants: { id: 'minecraft:emerald', count: 70 }, gives: { id: 'minecraft:bell' } });
        expect(javaTradeOffer('paid', paid, 0, sessionOf())?.wants[0]?.count).toBe(64);
        expect(javaTradeOffer('paid', paid, 0, sessionOf({ refused: ['paid'] }))).toBeUndefined();
    });
});

/** A host over a few trades in two sets, one trade per item. */
const hostOf = (refused: readonly string[], random: () => RandomSource): JavaTradeHost => {
    const trades = new Map(
        ['wheat', 'potato', 'carrot', 'pumpkin', 'melon'].map((item) => [
            `minecraft:farmer/${item}`,
            trade({ wants: { id: `minecraft:${item}`, count: 20 }, gives: { id: 'minecraft:emerald' }, xp: 2 })
        ])
    );
    const sets = new Map([
        ['minecraft:farmer/level_1', ['wheat', 'potato', 'carrot']],
        ['minecraft:farmer/level_2', ['pumpkin', 'melon']]
    ]);
    return {
        tradeSet: (id) => (sets.has(id) ? { trades: id, amount: 2, allowDuplicates: false } : undefined),
        tradesOf: (set) => (sets.get(String(set.trades)) ?? []).map((item) => `minecraft:farmer/${item}`),
        trade: (id) => trades.get(id),
        session: () => sessionOf({ random: random(), refused })
    };
};

describe("Java's trade sets as a merchant's offers", () => {
    it('draws a random trade out of the pool until it has the amount, passing over a refused one', () => {
        // The first draw takes the refused wheat, which leaves the pool without an offer.
        const host = hostOf(['minecraft:farmer/wheat'], () => scriptedRandom([0, 0, 0]));
        const offers = javaOfferSource(host, javaVillagerTradeSets('farmer'), JAVA_VILLAGER_LEVEL_EXPERIENCE).draw(
            0,
            1,
            0
        );

        expect(offers.map((offer) => offer.wants[0]?.item)).toEqual(['minecraft:potato', 'minecraft:carrot']);
    });

    it("unlocks the next set at Java's ten experience", () => {
        const merchant = new Merchant({
            source: javaOfferSource(
                hostOf([], () => seededRandom(3)),
                javaVillagerTradeSets('farmer'),
                JAVA_VILLAGER_LEVEL_EXPERIENCE
            ),
            random: seededRandom(3)
        });
        expect(merchant.offers()).toHaveLength(2);

        // Two experience a trade, and four uses an offer by default, so the two offers between them.
        for (let trade = 0; trade < 5; trade += 1) merchant.trade(trade % 2);

        expect(merchant.level).toBe(2);
        expect(
            merchant
                .offers()
                .slice(2)
                .map((offer) => offer.offer.wants[0]?.item)
                .sort()
        ).toEqual(['minecraft:melon', 'minecraft:pumpkin']);
    });
});
