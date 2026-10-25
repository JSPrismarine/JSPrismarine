/**
 * What a Bedrock client is told about one stack beyond its id and count.
 *
 * This is the `User Data Buffer` compound of a `NetworkItemStackDescriptor`, which is the same
 * compound the game calls an item's `tag`: `Damage` for the durability spent, `display.Name`
 * and `display.Lore` for the text under the item, and `ench` for the enchantments. A stack
 * that writes none of it draws as a plain item, which is what every enchanted tool, every
 * anvil rename and every lore line looked like before this file existed.
 *
 * `inventory/itemNbt.ts` is the same compound for a world record, and what a container item
 * holds comes straight from it: `itemSlotsToNbt` writes the `Items` list a shulker box's
 * tooltip preview is drawn from, nested stacks and all. Two things are decided differently
 * here, and those two are why this is not that module.
 *
 * Only what the client can draw. Storage writes the Java enchantment ids beside `ench` so the
 * round trip keeps the six Bedrock has no number for. The client cannot draw those ids, so
 * they stay off the top-level stack and reach the player as lore instead.
 *
 * The lore the client is given is not the lore the stack holds. An enchantment with no Bedrock
 * number is projected to a lore line through `projectToBedrock`, and those lines go above the
 * stack's own lore, where Java prints enchantments.
 */
import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { projectToBedrock, romanNumeral } from '@jsprismarine/enchantments';
import type { EnchantmentDefinition, EnchantmentRegistry } from '@jsprismarine/enchantments';

import { bedrockEnchantType } from '../enchantment/bedrockIds';
import { ITEMS_TAG, itemSlotsToNbt } from '../inventory/itemNbt';
import type { StoredItemStack } from '../inventory/persistence';
import { EnchantType } from '../network/packet/PlayerEnchantOptionsPacket';

/**
 * The `ench` entry that turns the glint on without naming an enchantment.
 *
 * A Bedrock client draws the glint from the length of `ench` and the tooltip lines from the
 * entries it recognizes, so an id outside `EnchantType` shines and prints nothing. Geyser's
 * `addEnchantmentGlint` writes the same entry for the same reason: a stack whose only
 * enchantments are server-side would otherwise look untouched.
 */
const GLINT_ENTRY = { id: -1, level: 1 } as const;

/** What one stack tells a client about itself, past the id, count and aux value on the wire. */
export interface ItemUserData {
    /** Enchantment id to level, by namespaced Java id, as the stack holds them. */
    readonly enchantments: ReadonlyMap<string, number>;
    /** The name an anvil gave the stack, or undefined for the item's own. */
    readonly customName: string | undefined;
    readonly lore: readonly string[];
    /**
     * Durability spent, which is Java's `minecraft:damage` and Bedrock's `tag.Damage`. The
     * client draws the damage bar from it; zero writes nothing.
     */
    readonly damage: number;
    /**
     * What a container item holds, one entry per slot and null for an empty one.
     *
     * Empty for everything but a shulker box. The client draws the four-item preview under a
     * box from this list, so a box whose contents stay on the server looks empty in the hand
     * however full it is.
     */
    readonly contents: readonly (StoredItemStack | null)[];
    /** The definitions, for naming an enchantment the client has no number for. */
    readonly enchantmentRegistry: EnchantmentRegistry | undefined;
}

/**
 * The Bedrock enchantment one Java id maps onto, by the name its number is known by.
 *
 * The projection asks for a Bedrock id and the wire wants the number, and both come out of
 * the one table in `enchantment/bedrockIds.ts`. The name is what makes an entry readable in a
 * failing test; {@link GLINT_ENTRY} is why the number cannot stand in for "no mapping".
 */
const bedrockName = (javaId: string): string | undefined => {
    const type = bedrockEnchantType(javaId);
    return type === undefined ? undefined : EnchantType[type];
};

/**
 * An enchantment id as a tooltip would print it: `minecraft:sweeping_edge` as `Sweeping Edge`.
 *
 * Vanilla prints the `description` component through the client's language file, and neither
 * half of that is here - the component is a translation key and a Bedrock client has no key
 * for an enchantment it does not have. A definition that states its description as plain text
 * is used as it stands, which is what a datapack naming its own enchantment gets. Otherwise
 * the id's path is title cased, so two enchantments whose ids differ only by namespace print
 * the same line.
 */
const enchantmentName = (definition: EnchantmentDefinition | undefined, id: string): string => {
    if (typeof definition?.description === 'string') return definition.description;

    const path = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
    return path
        .split('_')
        .filter((word) => word.length > 0)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};

/** The lore line for an enchantment the client cannot be told about: a name and a numeral. */
const enchantmentLore = (definition: EnchantmentDefinition | undefined, id: string, level: number): string =>
    `${enchantmentName(definition, id)} ${romanNumeral(level)}`;

const stringList = (values: readonly string[]): Set<Types.StringVal> =>
    new Set(values.map((value) => new Types.StringVal(value)));

/** One `ench` entry, which both halves of the list are built the same way. */
const enchantmentEntry = (id: number, level: number): NBTTagCompound => {
    const instance = new NBTTagCompound('');
    instance.addValue('id', new Types.ShortVal(id));
    instance.addValue('lvl', new Types.ShortVal(level));
    return instance;
};

/**
 * The compound a stack goes out under, or null when it has nothing to say.
 *
 * Null rather than an empty compound: an empty compound costs five bytes in every slot of
 * every inventory the server sends, and a client reads the absent marker as the same thing.
 *
 * The plain stack returns before anything is allocated, which is the case that runs most:
 * 36 inventory slots on every join and 1980 creative entries behind them, almost none of
 * them enchanted, named or damaged.
 */
export const itemUserDataTag = (stack: ItemUserData): NBTTagCompound | null => {
    if (
        stack.enchantments.size === 0 &&
        stack.customName === undefined &&
        stack.lore.length === 0 &&
        stack.damage <= 0 &&
        stack.contents.length === 0
    ) {
        return null;
    }

    const projection = projectToBedrock(stack.enchantmentRegistry, stack.enchantments, bedrockName, {
        lore: enchantmentLore
    });

    const ench = new Set<NBTTagCompound>();
    const projectedLore: string[] = [];
    for (const entry of projection.entries) {
        const type = bedrockEnchantType(entry.enchantment);
        if (type === undefined) {
            if (entry.lore !== undefined) projectedLore.push(entry.lore);
            continue;
        }
        ench.add(enchantmentEntry(type, entry.level));
    }
    if (projection.forceGlint) ench.add(enchantmentEntry(GLINT_ENTRY.id, GLINT_ENTRY.level));

    const lore = [...projectedLore, ...stack.lore];
    const tag = new NBTTagCompound('');
    let anything = false;

    if (stack.damage > 0) {
        tag.addValue('Damage', new Types.NumberVal(stack.damage));
        anything = true;
    }

    if (stack.customName !== undefined || lore.length > 0) {
        const display = new NBTTagCompound('display');
        if (stack.customName !== undefined) display.addValue('Name', new Types.StringVal(stack.customName));
        if (lore.length > 0) display.addValue('Lore', stringList(lore));
        tag.addChild(display);
        anything = true;
    }

    if (ench.size > 0) {
        tag.addValue('ench', ench);
        anything = true;
    }

    // Straight from the storage codec: a nested stack is written exactly as a stored one, so
    // the preview and the record cannot drift apart. Only the filled slots go out, each
    // carrying the slot it sits in, which is how vanilla writes a container.
    const held = itemSlotsToNbt(stack.contents);
    if (held.size > 0) {
        tag.addValue(ITEMS_TAG, held);
        anything = true;
    }

    return anything ? tag : null;
};
