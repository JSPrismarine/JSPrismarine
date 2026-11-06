import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTTagCompound } from '@jsprismarine/nbt';
import { Merchant, parseTradeTable } from '@jsprismarine/trading';
import { seededRandom } from '@jsprismarine/predicates';
import { describe, expect, it } from 'vitest';

import { tradeIndexOf, tradeNetIdOf, tradeOffersPayload } from './tradeOffers';

const FARMER = parseTradeTable(
    {
        tiers: [
            {
                total_exp_required: 0,
                groups: [
                    {
                        num_to_select: -1,
                        trades: [
                            {
                                wants: [{ item: 'minecraft:emerald', quantity: 20, price_multiplier: 0.05 }],
                                gives: [{ item: 'minecraft:bread', quantity: 6 }],
                                trader_exp: 2,
                                max_uses: 12,
                                reward_exp: true
                            },
                            {
                                wants: [
                                    { item: 'minecraft:wheat', quantity: 20, price_multiplier: 0.05 },
                                    { item: 'minecraft:emerald', quantity: 1, price_multiplier: 0.5 }
                                ],
                                gives: [{ item: 'minecraft:cookie', quantity: 8 }],
                                trader_exp: 3,
                                max_uses: 16,
                                reward_exp: false
                            }
                        ]
                    }
                ]
            },
            { total_exp_required: 10, groups: [] }
        ]
    },
    { pack: 'test' }
)!;

const decode = (payload: Buffer): NBTTagCompound =>
    NBTTagCompound.readFromStream(new BinaryStream(payload), ByteOrder.LITTLE_ENDIAN, true);

describe('trade offers on the wire', () => {
    const merchant = new Merchant({ table: FARMER, random: seededRandom(1) });

    it('names each offer by a net id the request can send back', () => {
        expect([0, 1, 5].map(tradeNetIdOf)).toEqual([1, 2, 6]);
        expect(tradeIndexOf(2, 2)).toBe(1);
        expect(tradeIndexOf(0, 2)).toBeUndefined();
        expect(tradeIndexOf(3, 2)).toBeUndefined();
        expect(tradeIndexOf(1.5, 2)).toBeUndefined();
    });

    it('writes what each offer costs now, what it gives and how far it has been used', () => {
        merchant.trade(0);
        const root = decode(tradeOffersPayload(merchant.offers(), merchant.tierRequirements()));
        const recipes = [...(root.getList('Recipes', false) ?? [])] as NBTTagCompound[];

        expect(recipes).toHaveLength(2);
        const [bread, cookie] = recipes as [NBTTagCompound, NBTTagCompound];
        expect(bread.getCompound('buyA', false)?.getString('Name', '')).toBe('minecraft:emerald');
        expect(bread.getNumber('buyCountA', 0)).toBe(20);
        expect(bread.getCompound('sell', false)?.getString('Name', '')).toBe('minecraft:bread');
        expect(bread.getNumber('uses', -1)).toBe(1);
        expect(bread.getNumber('maxUses', -1)).toBe(12);
        expect(bread.getByte('rewardExp', -1)).toBe(1);
        expect(bread.getNumber('netId', -1)).toBe(1);
        expect(bread.getCompound('buyB', false)).toBeNull();

        expect(cookie.getCompound('buyB', false)?.getString('Name', '')).toBe('minecraft:emerald');
        expect(cookie.getNumber('netId', -1)).toBe(2);
        expect(cookie.getNumber('uses', -1)).toBe(0);
    });

    it('lists the experience each level asks for', () => {
        const root = decode(tradeOffersPayload(merchant.offers(), merchant.tierRequirements()));
        const tiers = [...(root.getList('TierExpRequirements', false) ?? [])] as NBTTagCompound[];

        expect(tiers.map((tier, level) => tier.getNumber(String(level), -1))).toEqual([0, 10]);
    });
});
