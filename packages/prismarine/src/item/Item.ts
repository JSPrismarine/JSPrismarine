import { item_id_map as ItemIdMap } from '@jsprismarine/bedrock-data';
import type BinaryStream from '@jsprismarine/binaryutils';
import { attributeModifiers, enchantable, maxDamage, maxStackSize, tool } from '@jsprismarine/items';
import type { ItemType } from '@jsprismarine/items';
import type { ItemStack as PredicateItemStack } from '@jsprismarine/predicates';
import { ItemInstanceUserData, NetworkBinaryStream } from '@jsprismarine/protocol';

import type { ServerContent } from '../content/ServerContent';
import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { attributeValueOf } from '../enchantment/attributes';
import { holderSetIncludes } from './holderSets';
import type { TagLookup } from './holderSets';
import { vanillaItemTypes } from './vanillaItemTypes';

export interface ItemProps {
    /**
     * The item's numeric id.
     *
     * @deprecated Items have no numeric id any more; the name is the
     *   identity and the wire id is resolved from it. Still accepted so the
     *   handlers that pass one keep compiling.
     */
    id?: number;
    name: string;
    meta?: number;
    nbt?: unknown;
    count?: number;
    durability?: number;
    /**
     * The runtime id of the block state this stack places, when the name alone would get it
     * wrong. Vanilla's creative menu shows a piston facing up and sends a door with no block at
     * all, so a creative entry passes its own number rather than resolving its default state.
     */
    blockRuntimeId?: number;
    /** The content the item's components are read from, when the server built one. */
    content?: ServerContent;
    /**
     * Enchantments on the stack, as Java's `minecraft:enchantments` component
     * holds them: namespaced enchantment id to level.
     */
    enchantments?: ReadonlyMap<string, number> | Readonly<Record<string, number>>;
}

/** A player's own base attack damage, which an item modifies rather than replaces. */
const PLAYER_BASE_ATTACK_DAMAGE = 1;

/** The namespace every vanilla identifier carries, added to a bare name. */
const DEFAULT_NAMESPACE = 'minecraft';

/** `sharpness` and `minecraft:sharpness` name the same enchantment. */
const namespacedId = (id: string): string => (id.includes(':') ? id : `${DEFAULT_NAMESPACE}:${id}`);

/**
 * Normalizes whatever form a caller holds enchantment levels in into the map
 * the stack keeps: namespaced ids, whole levels, nothing at level zero.
 */
const enchantmentMap = (
    levels: ReadonlyMap<string, number> | Readonly<Record<string, number>> | undefined
): ReadonlyMap<string, number> => {
    if (levels === undefined) return new Map();

    // A plain record has no `Symbol.iterator`, which is what tells the two
    // apart without asserting that one of them is the other.
    const entries = Symbol.iterator in levels ? [...levels] : Object.entries(levels);
    const normalized = new Map<string, number>();
    for (const [id, level] of entries) {
        const whole = Math.trunc(level);
        if (whole > 0) normalized.set(namespacedId(id), whole);
    }
    return normalized;
};

/** The default stack size for an item no table names. */
const DEFAULT_MAX_STACK_SIZE = 64;

/** The wire id to name index, which is the item table read backwards; built on first use. */
let namesByWireId: ReadonlyMap<number, string> | undefined;

/**
 * The item a wire id names.
 *
 * The item table is name to id, and a stack arrives as an id, so the index
 * has to go the other way. Without it every stack the client sent came back
 * as `minecraft:unknown` and nothing a player held could be identified.
 */
const nameOfWireId = (id: number): string | undefined => {
    namesByWireId ??= new Map(Object.entries(ItemIdMap).map(([name, value]) => [value, name]));
    return namesByWireId.get(id);
};

/**
 * One item stack, as the rest of the server holds one.
 *
 * Everything it answers about itself - how hard it hits, how much armor it
 * is worth, how much durability it has, what it harvests - is read off Java's
 * data components rather than declared by a subclass. The 65 item classes
 * this replaced each restated one or two of those numbers; the table has all
 * of them, for all 1613 items.
 */
export class Item {
    private readonly name: string;
    private readonly legacyId: number;
    private readonly networkId: number | undefined;
    private readonly placedBlockRuntimeId: number | undefined;
    private readonly content: ServerContent | undefined;
    public meta = 0;
    public durability: number;

    // TODO
    public nbt = null;
    public count = 1;

    /**
     * The stack's `minecraft:enchantments`, by namespaced id.
     *
     * Held here rather than in a general component bag because this is the one
     * per-stack component the server reads today, and a bag with one entry in
     * it is a bag nobody can check the shape of. Written through
     * {@link Item.withEnchantments}, so a stack is never enchanted in place
     * behind the back of whatever is holding it.
     */
    private enchantmentLevels: ReadonlyMap<string, number>;

    public constructor({ id, name, meta, count, blockRuntimeId, content, enchantments }: ItemProps) {
        this.name = name;
        this.legacyId = id ?? 0;
        this.placedBlockRuntimeId = blockRuntimeId;
        this.content = content;
        this.enchantmentLevels = enchantmentMap(enchantments);
        if (meta) this.meta = meta;
        // Declared by `ItemProps` but silently dropped until 2168, so a stack read off the
        // wire came back as one item however many the client said it held.
        if (count) this.count = count;

        this.networkId = ItemIdMap[name];
        this.durability = this.getMaxDurability();
    }

    public getName(): string {
        return this.name;
    }

    /**
     * Whatever numeric id the caller built this stack with, or zero.
     *
     * @deprecated Items have no numeric id of their own any more; the name
     *   is the identity. Still carried because it is the fallback
     *   {@link Item.getNetworkId} uses for a name the item table does not
     *   have, which is how a plugin's item reaches the wire.
     */
    public getId(): number {
        return this.legacyId;
    }

    /** The id the client resolves this stack by. */
    public getNetworkId(): number {
        return this.networkId || this.getId();
    }

    public getMeta(): number {
        return this.meta;
    }

    /**
     * The item's resolved type, or undefined for a name no table knows.
     *
     * The content build when the server has one, so a pack that redefines an
     * item is what answers, and Java's committed table otherwise.
     */
    private type(): ItemType | undefined {
        return (this.content?.items.types ?? vanillaItemTypes()).get(this.name);
    }

    /**
     * What the item adds to one attribute, off `minecraft:attribute_modifiers`.
     *
     * Only `add_value` modifiers count, because the other operations scale a
     * total this has no view of. An item's default components carry at most one
     * `add_value` modifier per attribute, so the sum is that one number.
     *
     * The modifier's id is deliberately not matched. Java names these ids per
     * equipment slot for armor (`minecraft:armor.chestplate`,
     * `minecraft:armor.boots`, and three more), and matching on a guessed
     * `minecraft:base_armor` found nothing for all 41 armor items, which is
     * what left armor granting no protection at all.
     *
     * @param attribute - The attribute identifier, such as `minecraft:armor`.
     * @returns The amount added, or zero when the item modifies nothing.
     */
    private addedAttribute(attribute: string): number {
        const modifiers = this.type()?.params(attributeModifiers);
        if (modifiers === undefined) return 0;

        let total = 0;
        for (const modifier of modifiers) {
            if (modifier.type !== attribute) continue;
            if (modifier.operation !== 'add_value') continue;
            total += modifier.amount;
        }
        return total;
    }

    /** Whether the item's components make it a tool. */
    public isTool(): boolean {
        return this.type()?.params(tool) !== undefined;
    }

    /** Whether the item's components give it an armor value. */
    public isArmorPiece(): boolean {
        return this.getArmorDefensePoints() > 0;
    }

    /** How long the item burns in a furnace, in ticks. */
    public getBurnTime(): number {
        const id = this.content?.items.registry.idOf(this.name);
        return id === undefined ? 0 : (this.content?.items.facts.burnTimeTicks[id] ?? 0);
    }

    /**
     * Half-hearts a swing with this in hand is worth.
     *
     * The player's own base of one, plus the item's
     * `minecraft:base_attack_damage` modifier. A bare fist and a torch are
     * both worth one, which is vanilla's rule rather than a placeholder.
     */
    public getAttackDamage(): number {
        return PLAYER_BASE_ATTACK_DAMAGE + this.addedAttribute('minecraft:attack_damage');
    }

    /** The armor points the item is worth while worn. */
    public getArmorDefensePoints(): number {
        return this.addedAttribute('minecraft:armor');
    }

    /** The armor toughness the item is worth while worn. */
    public getArmorToughness(): number {
        return this.addedAttribute('minecraft:armor_toughness');
    }

    /**
     * The stack's enchantments, by namespaced Java id.
     *
     * Java ids and not Bedrock ones, because the enchantment definitions, the
     * loot tables and the effect components are all Java's and converting at
     * every read would mean converting back to run any of them.
     */
    public getEnchantments(): ReadonlyMap<string, number> {
        return this.enchantmentLevels;
    }

    /**
     * The level of one enchantment, or zero when the stack does not carry it.
     *
     * @param enchantment - A namespaced or bare Java enchantment id.
     */
    public getEnchantmentLevel(enchantment: string): number {
        return this.enchantmentLevels.get(namespacedId(enchantment)) ?? 0;
    }

    /**
     * A copy of this stack carrying a different enchantment set.
     *
     * A copy rather than a mutation: the anvil and the enchanting table both
     * compute a result before the player has paid for it, and a stack enchanted
     * in place would have been enchanted whether they paid or not.
     */
    public withEnchantments(levels: ReadonlyMap<string, number> | Readonly<Record<string, number>>): Item {
        const copy = new Item({
            id: this.legacyId,
            name: this.name,
            meta: this.meta,
            count: this.count,
            blockRuntimeId: this.placedBlockRuntimeId,
            content: this.content,
            enchantments: levels
        });
        copy.durability = this.durability;
        return copy;
    }

    /**
     * Whether the stack carries an enchantment at any level.
     *
     * @param enchantment - A namespaced or bare Java enchantment id. This took
     *   `ItemEnchantmentType` and always answered false; the enum numbers
     *   Bedrock's 37 enchantments, gives two of them the same number, and has
     *   nothing to say about the other six or about a datapack's.
     */
    public hasEnchantment(enchantment: string): boolean {
        return this.getEnchantmentLevel(enchantment) > 0;
    }

    public getMaxDurability(): number {
        return this.type()?.params(maxDamage) ?? 0;
    }

    public getDurability(): number {
        return this.durability;
    }

    public getMaxAmount(): number {
        return this.type()?.params(maxStackSize) ?? DEFAULT_MAX_STACK_SIZE;
    }

    public getAmount(): number {
        return this.count;
    }

    public isPartOfCreativeInventory(): boolean {
        return true;
    }

    /**
     * Whether swinging this harvests a block rather than destroying it for
     * nothing.
     *
     * Java's `minecraft:tool` rules in one pass: the first rule whose block
     * set matches and whose `correct_for_drops` is stated decides, which is
     * how `#minecraft:incorrect_for_stone_tool` stops a stone pickaxe mining
     * diamond while `#minecraft:mineable/pickaxe` lets it mine stone.
     *
     * @param block - The block identifier being mined.
     * @returns False for a bare name no rule covers, which is Java's answer too.
     */
    public harvests(block: string): boolean {
        const rules = this.type()?.params(tool)?.rules;
        if (!rules) return false;

        const tags: TagLookup | undefined = this.content?.tags;
        for (const rule of rules) {
            if (rule.correct_for_drops === undefined) continue;
            if (holderSetIncludes(tags, rule.blocks, block)) return rule.correct_for_drops;
        }
        return false;
    }

    /**
     * How fast this mines one block, which is Java's `Player.getDestroySpeed`
     * as far as a stack alone can answer it.
     *
     * The `minecraft:tool` rules give the base - the first rule whose block
     * set matches and that states a speed - and `minecraft:mining_efficiency`
     * raises it, which is the attribute Efficiency's modifier writes. Java
     * only adds the attribute to a speed already above one, so Efficiency does
     * nothing for a tool that is the wrong tool for the block.
     *
     * Dig Speed, Mining Fatigue, being underwater without Aqua Affinity and
     * being off the ground are the four other terms of Java's formula, and
     * none of them is modeled: there is no effect system and no swimming state
     * on an entity.
     *
     * @param block - The block identifier being mined.
     * @returns A multiplier on the base rate; 1 for a bare hand or an item
     *   with no rule for the block, which is Java's `Item.getDestroySpeed`.
     */
    public getMiningSpeed(block: string): number {
        const parameters = this.type()?.params(tool);
        const tags: TagLookup | undefined = this.content?.tags;

        let speed = parameters?.default_mining_speed ?? 1;
        for (const rule of parameters?.rules ?? []) {
            if (rule.speed === undefined) continue;
            if (holderSetIncludes(tags, rule.blocks, block)) {
                speed = rule.speed;
                break;
            }
        }

        const enchantments = this.content?.enchantments;
        if (speed <= 1 || enchantments === undefined || this.enchantmentLevels.size === 0) return speed;

        return attributeValueOf(enchantments, this.asPredicateStack(), 'minecraft:mining_efficiency', speed);
    }

    /**
     * This stack as the loot, predicate and enchantment grammars read one.
     *
     * The components carry what those grammars actually look at today:
     * `minecraft:enchantments` for Fortune, Looting, Silk Touch and every
     * effect component, and the three the item type declares that the
     * enchanting table and the anvil read off a stack -
     * `minecraft:enchantable`, `minecraft:max_damage` and `minecraft:damage`.
     * An empty map used to go out here, which made every `apply_bonus` see an
     * unenchanted tool and every enchanting table refuse every item.
     */
    public asPredicateStack(): PredicateItemStack {
        const components = new Map<string, unknown>();
        if (this.enchantmentLevels.size > 0) {
            components.set('minecraft:enchantments', { levels: Object.fromEntries(this.enchantmentLevels) });
        }

        const enchantability = this.type()?.params(enchantable)?.value;
        if (enchantability !== undefined) components.set('minecraft:enchantable', { value: enchantability });

        const limit = this.getMaxDurability();
        if (limit > 0) {
            components.set('minecraft:max_damage', limit);
            components.set('minecraft:damage', Math.max(0, limit - this.durability));
        }

        return { id: this.name, count: this.count, components };
    }

    /**
     * The empty stack.
     *
     * A count of zero as well as the air name, because at 2168 an empty stack still writes its
     * count - so an "empty" stack holding one of something says the slot has one air in it.
     */
    public static air(): Item {
        return new Item({ name: 'minecraft:air', meta: 0, count: 0 });
    }

    /**
     * The id this stack goes out under.
     *
     * Air is the empty slot, and the empty slot is a bare zero - not whatever number the item
     * table has for the name. It has one: `minecraft:air` is -158 there, and writing that
     * leaves the client holding a real item in every slot the player is not using.
     */
    private wireId(): number {
        return this.getName() === 'minecraft:air' ? 0 : this.getNetworkId();
    }

    /**
     * Writes an item stack in the form that carries a stack net id - an `ItemInstance`.
     *
     * There are two forms on the wire, and at 2168 they no longer differ by one byte. This
     * one, which an inventory, an equipped hand or a transaction carries, opens with a
     * **fixed two byte id** and closes with an *unsigned* block runtime id; the other,
     * {@link networkSerializeWithoutStackId}, uses a varint for both. Neither still stops
     * early for air: up to 748 a zero id was the whole stack, and now every field is written
     * whatever the id is. An inventory is mostly empty slots, so a stack that stops after the
     * id truncates the packet almost immediately - which is exactly what the client reports
     * as a bad packet on join, before any of the interesting packets are even reached.
     * @param {BinaryStream} stream - the stream to write to.
     * @param {number | null} stackNetId - the stack's net id, when the receiver tracks one.
     * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/network-item-stack-descriptor/
     */
    public networkSerialize(stream: BinaryStream, stackNetId: number | null = null): void {
        const networkId = this.wireId();

        stream.writeShortLE(networkId);
        stream.writeUnsignedShortLE(networkId === 0 ? 0 : this.getAmount());
        stream.writeUnsignedVarInt(networkId === 0 ? 0 : this.meta);

        stream.writeBoolean(stackNetId !== null);
        if (stackNetId !== null) {
            stream.writeVarInt(stackNetId);
        }

        stream.writeUnsignedVarInt(networkId === 0 ? 0 : this.getBlockRuntimeId());
        this.writeExtraData(stream, networkId !== 0);
    }

    /**
     * Writes an item stack in the form that carries no stack net id - an `ItemStack`.
     *
     * What the creative menu and every recipe carries, because nothing is tracking these
     * stacks. See {@link networkSerialize} for how the two forms differ beyond the flag.
     */
    public networkSerializeWithoutStackId(stream: BinaryStream): void {
        const networkId = this.wireId();

        stream.writeVarInt(networkId);
        stream.writeUnsignedShortLE(networkId === 0 ? 0 : this.getAmount());
        stream.writeUnsignedVarInt(networkId === 0 ? 0 : this.meta);
        stream.writeVarInt(networkId === 0 ? 0 : this.getBlockRuntimeId());

        this.writeExtraData(stream, networkId !== 0);
    }

    /**
     * The runtime id of the block this item places, or zero for anything that places none.
     *
     * An id given at construction wins. Otherwise the name resolves to the block's default
     * state, which is right for a stack a player holds and wrong for two kinds of creative
     * entry: a block the menu shows in another state (a piston faces up there), and the item
     * form of a block vanilla treats as a plain item (a door, a bed, a hanging sign travel with
     * a zero) while this server has a block schema under the same name.
     * @returns {number} the hashed block runtime id, or `0`.
     */
    public getBlockRuntimeId(): number {
        return this.placedBlockRuntimeId ?? BlockRuntimeIds.tryGetByName(this.getName()) ?? 0;
    }

    /**
     * The length prefixed `User Data Buffer`: the stack's `ItemInstanceUserData`, which
     * `@jsprismarine/protocol` lays out.
     *
     * No stack here carries NBT or a can-place-on or can-destroy list yet, so the blob is the
     * empty structure: a zero marker and two empty lists, plus the blocking tick a shield ends
     * with. An empty stack writes a bare zero length instead of the structure.
     * @param {BinaryStream} stream - the stream to write to.
     * @param {boolean} present - whether this stack holds anything at all.
     */
    private writeExtraData(stream: BinaryStream, present: boolean): void {
        if (!present) {
            stream.writeUnsignedVarInt(0);
            return;
        }

        const blob = new NetworkBinaryStream();
        const shield = this.getName() === 'minecraft:shield';
        new ItemInstanceUserData(null, shield ? { blockingTick: 0n } : {}).serialize(blob);

        stream.writeUnsignedVarInt(blob.getBuffer().byteLength);
        stream.write(new Uint8Array(blob.getBuffer()));
    }

    /**
     * Reads an item stack off the wire.
     *
     * The layout is `NetworkItemStackDescriptor`, which `@jsprismarine/protocol` already
     * describes: the id, the count, the aux value, an **always present** flag saying whether
     * a stack net id follows, the block runtime id, and one length prefixed blob holding the
     * nbt and the can-place-on / can-break lists. All of it, even for air.
     *
     * That blob is stepped over rather than parsed. Nothing here uses it yet, and its length
     * is on the wire precisely so that a reader who does not care can skip it - which is also
     * why the two lists are no longer walked string by string.
     *
     * Reading the flag is what keeps every field after it aligned. It used to be read only
     * when a caller asked for `extra`, which no caller ever did, so from that byte onwards
     * the reader was one out: the lists it then walked had garbage lengths, ran off the end
     * of the buffer and threw. Every InventoryTransaction died there - which is what left a
     * survival block break with no sound, the packet never reaching its handler.
     * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/network-item-stack-descriptor/
     */
    public static networkDeserialize(stream: BinaryStream): Item {
        return Item.readStack(stream, true);
    }

    /**
     * Reads the form that carries no stack net id - the creative menu's.
     *
     * The counterpart to {@link networkSerializeWithoutStackId}; see it for why the two
     * forms exist and what confusing them costs.
     */
    public static networkDeserializeWithoutStackId(stream: BinaryStream): Item {
        return Item.readStack(stream, false);
    }

    private static readStack(stream: BinaryStream, hasStackIdFlag: boolean): Item {
        // Two bytes in the tracked form, a varint in the other. This is the one asymmetry
        // between them that is not the flag, and it is the reason they no longer share a
        // reader beyond this line.
        const id = hasStackIdFlag ? stream.readShortLE() : stream.readVarInt();

        const count = stream.readUnsignedShortLE();
        const meta = stream.readUnsignedVarInt();

        if (hasStackIdFlag && stream.readBoolean()) {
            stream.readVarInt(); // Stack net id, only present when the flag above says so.
        }

        // Block runtime id, for the block this item places. Unsigned in the tracked form.
        if (hasStackIdFlag) stream.readUnsignedVarInt();
        else stream.readVarInt();

        stream.read(stream.readUnsignedVarInt()); // nbt, can place on, can break.

        // Read to the end whatever the id, because an empty stack is no longer a bare zero -
        // it is a full stack of zeroes, and stopping at the id leaves the rest of it to be
        // read as the next field.
        if (id === 0) return new Item({ name: 'minecraft:air' });

        // The id is carried as well as resolved, so a stack whose id the item
        // table does not name still goes back out under the number it came in
        // under.
        return new Item({ id, name: nameOfWireId(id) ?? 'minecraft:unknown', meta, count });
    }
}
