/**
 * The enchanting table: the three rows a player is offered, and what taking
 * one does.
 *
 * `enchantingOffers` in `@jsprismarine/enchantments` is Java's draw, verbatim
 * and tested against values a Java program produced from the real
 * `java.util.Random`. This module is the server's half of it: where the seed
 * lives, how an offer reaches the client, and what paying for one costs.
 *
 * The seed is the load-bearing detail. Java drives all three rows from one
 * generator seeded with the player's enchantment seed, which is what makes the
 * rows stay put while the player puts the item in and takes it out again, and
 * rerolls the seed once something is enchanted so the next item is a fresh
 * draw. Keeping that per player, and in the player data record, is what makes
 * a table behave the same way across a login.
 */
import { enchantingOffers, selectEnchantments } from '@jsprismarine/enchantments';
import { javaRandom } from '@jsprismarine/enchantments';
import type { EnchantmentRegistry } from '@jsprismarine/enchantments';

import { advancementEnchantedItem } from '../advancement/triggers';
import type Player from '../Player';
import { AttributeIds } from '../entity/Attribute';
import { spendExperienceLevels } from '../entity/Experience';
import type { Item } from '../item/Item';
import type { EnchantmentInstance, ItemEnchantOption } from '../network/packet/PlayerEnchantOptionsPacket';
import PlayerEnchantOptionsPacket from '../network/packet/PlayerEnchantOptionsPacket';
import { bedrockEnchantType } from './bedrockIds';
import { bookshelfPowerAround } from './bookshelves';
import type { BlockPosition } from './bookshelves';

/** An enchanting table always shows three rows, even when some of them are empty. */
export const ENCHANTING_SLOTS = 3;

/**
 * The slot groups Bedrock calls equipment-activated: the ones that do their
 * work while the item is worn rather than held.
 */
const WORN_GROUPS: ReadonlySet<string> = new Set(['armor', 'head', 'chest', 'legs', 'feet', 'body', 'saddle']);

/** The groups that work while the item is in a hand. */
const HELD_GROUPS: ReadonlySet<string> = new Set(['mainhand', 'offhand', 'hand']);

const seeds = new WeakMap<Player, number>();

/** A fresh seed, in the 32-bit range Java's own reroll produces. */
const freshSeed = (): number => Math.floor(Math.random() * 0x7fffffff);

/**
 * The player's enchantment seed, drawn once and then kept.
 *
 * @param stored - The seed off the player data record, used the first time
 *   this player is asked.
 */
export const enchantmentSeedOf = (player: Player, stored?: number): number => {
    const held = seeds.get(player);
    if (held !== undefined) return held;

    const seed = stored ?? freshSeed();
    seeds.set(player, seed);
    return seed;
};

/** Draws a new seed, which is what Java does the moment something is enchanted. */
export const rerollEnchantmentSeed = (player: Player): number => {
    const seed = freshSeed();
    seeds.set(player, seed);
    return seed;
};

/** Where an offer's enchantments go in the three lists the packet carries. */
const splitBySlot = (registry: EnchantmentRegistry, picks: readonly { enchantment: string; level: number }[]) => {
    const equipActivatedEnchants: EnchantmentInstance[] = [];
    const heldActivatedEnchants: EnchantmentInstance[] = [];
    const selfActivatedEnchants: EnchantmentInstance[] = [];

    for (const pick of picks) {
        const enchantType = bedrockEnchantType(pick.enchantment);
        // Nothing to send for an enchantment the client's registry does not
        // list. The draw still happened and taking the row still applies it;
        // the client simply cannot draw that line of the tooltip.
        if (enchantType === undefined) continue;

        const instance = { enchantType, enchantLevel: pick.level };
        const slots = registry.get(pick.enchantment)?.slots ?? [];
        if (slots.some((slot) => WORN_GROUPS.has(slot))) equipActivatedEnchants.push(instance);
        else if (slots.some((slot) => HELD_GROUPS.has(slot))) heldActivatedEnchants.push(instance);
        else selfActivatedEnchants.push(instance);
    }

    return { equipActivatedEnchants, heldActivatedEnchants, selfActivatedEnchants };
};

/**
 * Redraws one row's picks.
 *
 * `enchantingOffers` returns the cost and the one enchantment the client shows
 * as a hint, not the whole draw, because that is all the preview needs. Taking
 * the row needs the rest, and Java gets it the same way: by reseeding with
 * `seed + row` and running the same selection again.
 */
export const enchantmentsForRow = (
    registry: EnchantmentRegistry,
    stack: Item,
    seed: number,
    row: number,
    cost: number
): readonly { enchantment: string; level: number }[] => {
    const random = javaRandom(seed + row);
    return selectEnchantments(registry, random, stack.asPredicateStack(), cost);
};

/** One row of the table, ready to send and ready to pay for. */
export interface EnchantingRow {
    readonly cost: number;
    readonly picks: readonly { enchantment: string; level: number }[];
}

/**
 * The three rows for one stack in one table.
 *
 * @param bookshelfPower - Bookshelves around the table, clamped to
 *   {@link MAX_BOOKSHELF_POWER}.
 * @returns Exactly {@link ENCHANTING_SLOTS} rows, cheapest first. A row with a
 *   cost of zero is one the table shows empty.
 */
export const enchantingRows = (
    registry: EnchantmentRegistry,
    stack: Item,
    seed: number,
    bookshelfPower: number
): readonly EnchantingRow[] =>
    enchantingOffers(registry, stack.asPredicateStack(), { seed, bookshelfPower }).map((offer, row) => ({
        cost: offer.cost,
        picks: offer.cost <= 0 ? [] : enchantmentsForRow(registry, stack, seed, row, offer.cost)
    }));

/**
 * The rows as `PlayerEnchantOptionsPacket` carries them.
 *
 * The net ids count from one within this set, which is what the client sends
 * back to pick a row; {@link takeEnchantingRow} reads one back out.
 */
export const enchantOptionsOf = (registry: EnchantmentRegistry, rows: readonly EnchantingRow[]): ItemEnchantOption[] =>
    rows.flatMap((row, slot) =>
        row.cost <= 0
            ? []
            : [
                  {
                      cost: row.cost,
                      enchants: { slot, ...splitBySlot(registry, row.picks) },
                      // Shown in the Standard Galactic Alphabet, so it is
                      // decoration rather than information; vanilla draws it
                      // from a list of made-up words.
                      enchantName: '',
                      enchantNetId: slot + 1
                  }
              ]
    );

/**
 * Sends the three rows to one player, or clears the table when there is
 * nothing to offer.
 */
export const sendEnchantOptions = async (player: Player, options: readonly ItemEnchantOption[]): Promise<void> => {
    const packet = new PlayerEnchantOptionsPacket();
    packet.options = [...options];
    await player.getNetworkSession().send(packet);
};

/**
 * Works out the three rows for a player at a table and sends them.
 *
 * This is the whole call the interaction path needs: a right-click on a
 * `minecraft:enchanting_table` that puts a stack in the table's input slot
 * calls this, and the client draws real offers rather than the placeholders
 * its own preview would compute. It is also what has to be called again each
 * time the input slot changes, because the rows depend on the stack.
 *
 * @param stack - What is in the table's input slot, or undefined to clear it.
 */
export const showEnchantingTable = async (
    player: Player,
    stack: Item | undefined,
    at: BlockPosition
): Promise<void> => {
    const registry = player.getServer().getContent()?.enchantments;
    if (!registry || !stack || stack.getName() === 'minecraft:air') {
        await sendEnchantOptions(player, []);
        return;
    }

    const power = await bookshelfPowerAround(player.getWorld(), at);
    const rows = enchantingRows(registry, stack, enchantmentSeedOf(player), power);
    await sendEnchantOptions(player, enchantOptionsOf(registry, rows));
};

/** What taking a row produced. */
export interface EnchantingResult {
    readonly stack: Item;
    /** Experience levels actually spent. */
    readonly cost: number;
}

/**
 * Applies one row to a stack and charges for it.
 *
 * The experience is spent here and the seed is rerolled here, so a caller
 * cannot enchant twice from one draw. Java also spends lapis; this does not,
 * because nothing in the container path accounts for the second input slot
 * yet.
 *
 * @returns Undefined when the row is empty, the player cannot pay, or the
 *   draw produced nothing.
 */
export const takeEnchantingRow = (
    registry: EnchantmentRegistry,
    player: Player,
    stack: Item,
    seed: number,
    bookshelfPower: number,
    row: number
): EnchantingResult | undefined => {
    const rows = enchantingRows(registry, stack, seed, bookshelfPower);
    const chosen = rows[row];
    if (!chosen || chosen.cost <= 0 || chosen.picks.length === 0) return undefined;

    const holder = {
        getLevel: () => player.attributes.getValue(AttributeIds.PlayerLevel),
        getProgress: () => player.attributes.getValue(AttributeIds.PlayerExperience),
        setLevel: (level: number) => player.attributes.setValue(AttributeIds.PlayerLevel, level),
        setProgress: (progress: number) => player.attributes.setValue(AttributeIds.PlayerExperience, progress)
    };
    if (!spendExperienceLevels(holder, chosen.cost)) return undefined;

    const levels = new Map(stack.getEnchantments());
    for (const pick of chosen.picks) levels.set(pick.enchantment, pick.level);

    const enchanted = stack.withEnchantments(levels);
    rerollEnchantmentSeed(player);
    advancementEnchantedItem(player, enchanted, chosen.cost);

    return { stack: enchanted, cost: chosen.cost };
};
