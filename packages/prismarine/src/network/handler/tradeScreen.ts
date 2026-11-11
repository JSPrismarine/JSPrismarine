/**
 * What a villager's trade screen does with an item stack request.
 *
 * The screen has two payment slots and a result. The player moves the payment in, one request per
 * move, and then asks to make an offer: a `CRAFTING_RECIPE` whose number is the offer's `netId`
 * from the `UpdateTradePacket`. This checks that the payment in the slots covers the price the
 * offer has now, builds the result, and says what the request has to spend. The trader's own
 * state - the offer's uses, its demand, the experience and the level - moves only in
 * {@link TradeSelection.commit}, which the handler runs once the whole request has passed, so a
 * request refused halfway leaves the villager exactly as it was.
 */
import type { TradeResult, TradeStack } from '@jsprismarine/trading';

import type { ServerContent } from '../../content/ServerContent';
import { addExperiencePoints } from '../../entity/Experience';
import type { StorePlayer } from '../../entity/storePlayer';
import { Item } from '../../item/Item';
import { tradeIndexOf } from '../tradeOffers';
import type { OpenBlockContainer } from '../PlayerSession';

/** An offer the player asked for, ready to be spent on and taken. */
export interface TradeSelection {
    /** The finished stack, which the client takes out of the result slot. */
    readonly stack: Item;
    /** How much each payment slot has to give up, by slot. */
    readonly owed: Map<number, number>;
    /** Moves the trader's state and pays the player's experience; run once the request has passed. */
    readonly commit: () => TradeResult;
}

/** The player as a trade reads it: the components that hold the experience an offer pays. */
export type Trader = Pick<StorePlayer, 'getComponents'>;

/** Whether a payment stack is what the offer wants: the same item and the same aux value. */
const pays = (held: Item, want: TradeStack): boolean =>
    held.getName() === want.item &&
    held.meta === ((want.components.get('minecraft:aux_value') as number | undefined) ?? held.meta); // an aux value is a whole number by the function that writes it

/**
 * Picks the offer a request names and checks the payment against its price.
 *
 * @param player - The trading player, who is paid the offer's experience.
 * @param open - The open trade screen, with the payment in `inputs`.
 * @param netId - The `recipeNetId` of the action, which is the offer's `netId`.
 * @param content - The server's content, which the offered stack is built from.
 * @returns The selection, or undefined when the offer does not exist, is sold out, or the
 * payment does not cover its price now.
 */
export const selectTrade = (
    player: Trader,
    open: OpenBlockContainer,
    netId: number,
    content: ServerContent
): TradeSelection | undefined => {
    const trade = open.trade;
    if (trade === undefined) return undefined;

    const context = trade.context();
    const offers = trade.source.offers(context);
    const index = tradeIndexOf(netId, offers.length);
    const live = index === undefined ? undefined : offers[index];
    if (index === undefined || live === undefined || !live.available) return undefined;

    // Each wanted stack is matched to a payment slot of its own, in either order, because the
    // client puts the first want in the first slot but nothing here relies on it.
    const owed = new Map<number, number>();
    for (const want of live.wants) {
        const slot = open.inputs.findIndex(
            (held, candidate) =>
                held !== null && !owed.has(candidate) && pays(held, want) && held.getAmount() >= want.count
        );
        if (slot === -1) return undefined;
        owed.set(slot, want.count);
    }

    const [give] = live.offer.gives;
    if (give === undefined) return undefined;
    const aux = give.components.get('minecraft:aux_value');
    const enchantments = give.components.get('minecraft:enchantments');
    const stack = new Item({
        name: give.item,
        count: give.count,
        content,
        ...(typeof aux === 'number' ? { meta: aux } : {}),
        ...(typeof enchantments === 'object' && enchantments !== null
            ? { enchantments: enchantments as Record<string, number> } // keys are Java enchantment ids by the function's contract
            : {})
    });

    return {
        stack,
        owed,
        commit: () => {
            const result = trade.source.trade(index, context);
            if (result.traded && result.playerExperience > 0) {
                addExperiencePoints(player.getComponents().experience(), result.playerExperience);
            }
            trade.traded?.(result);
            return result;
        }
    };
};
