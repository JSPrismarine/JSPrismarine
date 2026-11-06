/**
 * A trader's offers as the client's trade screen reads them.
 *
 * `UpdateTradePacket` carries the offers as one network NBT compound: a `Recipes` list with a
 * compound per offer, and `TierExpRequirements`, the experience each villager level asks for.
 * Each offer names its payment (`buyA`, `buyB`) and its result (`sell`) as item compounds, how
 * far the stock and price have moved (`uses`, `maxUses`, `demand`, the two price multipliers),
 * and a `netId` the client sends back in an item stack request to say which offer it is making.
 * The prices written here are the ones the player pays now, after demand and the discounts, so
 * the screen and the trade that follows agree on the cost.
 */
import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTTagCompound, NBTWriter, Types } from '@jsprismarine/nbt';
import type { LiveOffer, TradeStack } from '@jsprismarine/trading';

import { itemStackToNbt } from '../inventory/itemNbt';
import type { StoredItemStack } from '../inventory/persistence';

/** The first network id an offer is given; an offer's id is this plus its position in the list. */
export const TRADE_NET_ID_BASE = 1;

/** The net id the client names the offer at `index` by. */
export const tradeNetIdOf = (index: number): number => TRADE_NET_ID_BASE + index;

/** The position of the offer a net id names, or undefined when it names none of `count` offers. */
export const tradeIndexOf = (netId: number, count: number): number | undefined => {
    const index = netId - TRADE_NET_ID_BASE;
    return Number.isInteger(index) && index >= 0 && index < count ? index : undefined;
};

/** The stored form of one trade stack, with the components a client can see. */
export const storedTradeStack = (stack: TradeStack): StoredItemStack => {
    const aux = stack.components.get('minecraft:aux_value');
    const enchantments = stack.components.get('minecraft:enchantments');
    return {
        name: stack.item,
        count: stack.count,
        ...(typeof aux === 'number' && Number.isInteger(aux) ? { meta: aux } : {}),
        ...(typeof enchantments === 'object' && enchantments !== null && !Array.isArray(enchantments)
            ? { enchantments: enchantments as Record<string, number> } // keys are Java enchantment ids by the function's contract
            : {})
    };
};

/** One stack as the item compound a recipe holds under `name`. */
const stackNbt = (name: string, stack: TradeStack): NBTTagCompound => {
    const compound = itemStackToNbt(storedTradeStack(stack));
    compound.setName(name);
    return compound;
};

const recipeNbt = (live: LiveOffer, index: number): NBTTagCompound => {
    const recipe = new NBTTagCompound('');
    const [first, second] = live.wants;
    const [sell] = live.offer.gives;

    if (first !== undefined) recipe.addChild(stackNbt('buyA', first));
    if (second !== undefined) recipe.addChild(stackNbt('buyB', second));
    if (sell !== undefined) recipe.addChild(stackNbt('sell', sell));
    recipe.addValue('buyCountA', new Types.NumberVal(first?.count ?? 0));
    recipe.addValue('buyCountB', new Types.NumberVal(second?.count ?? 0));
    recipe.addValue('maxUses', new Types.NumberVal(live.offer.maxUses));
    recipe.addValue('uses', new Types.NumberVal(live.uses));
    recipe.addValue('traderExp', new Types.NumberVal(live.offer.traderExp));
    recipe.addValue('rewardExp', new Types.ByteVal(live.offer.rewardExp ? 1 : 0));
    recipe.addValue('demand', new Types.NumberVal(live.demand));
    recipe.addValue('priceMultiplierA', new Types.FloatVal(live.offer.priceMultipliers[0] ?? 0));
    recipe.addValue('priceMultiplierB', new Types.FloatVal(live.offer.priceMultipliers[1] ?? 0));
    recipe.addValue('tier', new Types.NumberVal(live.offer.tier));
    recipe.addValue('netId', new Types.NumberVal(tradeNetIdOf(index)));
    return recipe;
};

/**
 * The offers compound `UpdateTradePacket` carries, as network NBT bytes.
 *
 * @param offers - The trader's offers with the prices the player pays now.
 * @param tierRequirements - The experience each level asks for, in level order.
 */
export const tradeOffersPayload = (offers: readonly LiveOffer[], tierRequirements: readonly number[]): Buffer => {
    const root = new NBTTagCompound('');
    root.addValue('Recipes', new Set(offers.map(recipeNbt)));
    root.addValue(
        'TierExpRequirements',
        new Set(
            tierRequirements.map((experience, tier) => {
                const requirement = new NBTTagCompound('');
                requirement.addValue(String(tier), new Types.NumberVal(experience));
                return requirement;
            })
        )
    );

    const stream = new BinaryStream();
    const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
    writer.setUseVarint(true);
    writer.writeCompound(root);
    return stream.getBuffer();
};
