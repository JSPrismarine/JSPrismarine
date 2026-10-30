import type BinaryStream from '@jsprismarine/binaryutils';
import { attributeModifiers, enchantable, equippable, maxDamage, maxStackSize, tool } from '@jsprismarine/items';
import type { ItemType } from '@jsprismarine/items';
import type { ItemStack as PredicateItemStack } from '@jsprismarine/predicates';
import type { NBTTagCompound } from '@jsprismarine/nbt';
import { ItemInstanceUserData, NetworkBinaryStream } from '@jsprismarine/protocol';
import {
    readItemStackDescriptor,
    writeItemStackDescriptor
} from '@jsprismarine/protocol/wire/structures/ItemStackDescriptor';

import type { ItemStackDescriptorData } from '@jsprismarine/protocol/wire/structures/ItemStackDescriptor';

import type { ServerContent } from '../content/ServerContent';
import { javaItemTagsForBedrock } from '../content/javaTags';
import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { attributeValueOf } from '../enchantment/attributes';
import { itemData2193, itemDataForProtocol } from '../network/codec/itemData';
import type { ProtocolItemData } from '@jsprismarine/protocol';
import NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import { storedItem } from '../inventory/persistence';
import { holderSetIncludes } from './holderSets';
import type { TagLookup } from './holderSets';
import { itemUserDataTag } from './userData';
import { vanillaItemTypes } from './vanillaItemTypes';

export interface ItemProps {
    /** The Bedrock runtime id to retain when the item name is not in the vanilla table. */
    runtimeId?: number;
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
    /** The name an anvil gave the stack, which replaces the item's own on the client. */
    customName?: string;
    /** The lines an item modifier wrote under the name. */
    lore?: readonly string[];
    /** Bedrock block identifiers this stack may be placed on in adventure mode. */
    canPlaceOnBlocks?: readonly string[];
    /** Bedrock block identifiers this stack may destroy in adventure mode. */
    canDestroyBlocks?: readonly string[];
    /**
     * What a container item holds, one entry per slot and null for an empty one.
     *
     * Java's `minecraft:container`. A shulker box carries its whole inventory here between
     * being broken and being placed again.
     */
    contents?: readonly (Item | null)[];
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

/**
 * The item numbering the wire a stack is being written to or read from speaks.
 *
 * A stack carries a number, and which number names which item is fixed by the protocol
 * version rather than being universal: 1.26.60 moved 82 of them. The stream a stack travels
 * through is the packet itself on every path a client is on either end of, and the packet
 * carries the codec that built it, so the numbering is already here and nothing above has to
 * pass it down. A bare stream - a stack written to disk, or to a buffer assembled by hand -
 * gets protocol 2193's, the canonical table.
 */
const wireItemData = (stream: BinaryStream): ProtocolItemData =>
    stream instanceof NetworkPacket ? itemDataForProtocol(stream.codecProtocol) : itemData2193;

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
    private readonly runtimeId: number;
    private readonly placedBlockRuntimeId: number | undefined;
    private readonly content: ServerContent | undefined;
    public meta = 0;
    public durability: number;

    // TODO
    public nbt = null;
    public count = 1;

    /**
     * The stack network id the client knows this stack by, or 0 before it has one.
     *
     * The inventory packets write it, so that a client and the server name a stack by the same
     * number in an `ItemStackRequest` and in its answer. A stack read off the wire keeps the id
     * it came with.
     *
     * Ids are counted per player by `HumanInventory.assignStackNetworkId`. A stack keeps its id
     * when it moves whole or changes size through {@link Item.withCount}; every other copy starts
     * without one, and so does a part split off a stack.
     */
    public stackNetworkId = 0;

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

    /**
     * The stack's `minecraft:custom_name` and `minecraft:lore`.
     *
     * Beside the enchantments for the same reason they are: these are the two
     * other per-stack components an anvil writes and the client draws, and a
     * stack that loses them on a logout comes back as a plain tool with a
     * different name.
     */
    private readonly customName: string | undefined;
    private readonly loreLines: readonly string[];
    private readonly canPlaceOnBlocks: readonly string[];
    private readonly canDestroyBlocks: readonly string[];

    /**
     * The stack's `minecraft:container`, which is empty for all but a shulker box.
     *
     * A list of stacks rather than a record shape, because a shulker box in a player's hand
     * is holding the same things an open chest is: whatever the slots were left with, with
     * their own enchantments and names on them.
     */
    private readonly heldContents: readonly (Item | null)[];

    public constructor({
        runtimeId,
        name,
        meta,
        count,
        blockRuntimeId,
        content,
        enchantments,
        customName,
        lore,
        canPlaceOnBlocks,
        canDestroyBlocks,
        contents
    }: ItemProps) {
        this.name = name;
        this.runtimeId = runtimeId ?? 0;
        this.placedBlockRuntimeId = blockRuntimeId;
        this.content = content;
        this.enchantmentLevels = enchantmentMap(enchantments);
        this.customName = customName === '' ? undefined : customName;
        this.loreLines = lore === undefined ? [] : [...lore];
        this.canPlaceOnBlocks = canPlaceOnBlocks === undefined ? [] : [...canPlaceOnBlocks];
        this.canDestroyBlocks = canDestroyBlocks === undefined ? [] : [...canDestroyBlocks];
        this.heldContents = contents === undefined ? [] : [...contents];
        if (meta) this.meta = meta;
        // Zero is the empty stack's count; treating it as missing turns air into a live item.
        if (count !== undefined) this.count = count;

        this.durability = this.getMaxDurability();
    }

    public getName(): string {
        return this.name;
    }

    /** The Bedrock tags attached to this item type, or an empty list when it has no type. */
    public getTags(): readonly string[] {
        return this.type()?.tags ?? [];
    }

    /** Whether this item type carries one of its Bedrock tags. */
    public hasTag(tag: string): boolean {
        return this.type()?.hasTag(tag) ?? false;
    }

    /** The Java datapack tags attached to this Bedrock item type. */
    public getJavaTags(): readonly string[] {
        const type = this.type();
        if (type !== undefined) return type.javaTags;

        const tags = this.content?.tags;
        return tags === undefined ? [] : javaItemTagsForBedrock(tags, this.name);
    }

    /** Whether a Java datapack tag includes this item type. */
    public hasJavaTag(tag: string): boolean {
        const type = this.type();
        if (type !== undefined) return type.hasJavaTag(tag);
        return this.getJavaTags().includes(tag);
    }

    /** Whether the resolved item type declares the named data component. */
    public hasComponent(name: string): boolean {
        return this.type()?.hasComponent(name) ?? false;
    }

    /**
     * The Bedrock runtime id for this item under the canonical numbering, protocol 2193's.
     *
     * What everything off the wire means by an item's number. A stack going to a client is
     * numbered by {@link Item.wireId} against that session's own table instead, because the
     * two disagree for 82 items from 1.26.60 on.
     */
    public getRuntimeId(): number {
        return this.runtimeIdIn(itemData2193);
    }

    /**
     * This item's number under one protocol version's table, falling back to the number the
     * stack was constructed with for a name that table does not have - which is how an item
     * this server invented reaches a client at all.
     */
    private runtimeIdIn(itemData: ProtocolItemData): number {
        return itemData.table[this.name]?.runtime_id ?? this.runtimeId;
    }

    /** The stack's damage or variant value, which the wire carries beside the id. */
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

    /**
     * Where `minecraft:equippable` says this item is worn.
     *
     * The game's own answer to which slot an item occupies, which is what dressing a mob from a
     * loot table needs: the table names `minecraft:iron_helmet` and nothing else says it is a
     * helmet. One of `@jsprismarine/items`' `EQUIPMENT_SLOTS`.
     * @returns {string | undefined} The slot name, or undefined for an item that is not worn,
     *   which a sword and a bow are.
     */
    public getEquipmentSlot(): string | undefined {
        return this.type()?.params(equippable)?.slot;
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

    /** The name an anvil gave this stack, or undefined when it still has the item's own. */
    public getCustomName(): string | undefined {
        return this.customName;
    }

    /** The lore lines on this stack, which is an empty array for most of them. */
    public getLore(): readonly string[] {
        return this.loreLines;
    }

    /**
     * What this stack holds inside it, one entry per slot and null for an empty one.
     *
     * Empty for everything but a container item, which today is the shulker box.
     */
    public getContents(): readonly (Item | null)[] {
        return this.heldContents;
    }

    /** The Bedrock block identifiers this stack may be placed on. */
    public getCanPlaceOnBlocks(): readonly string[] {
        return this.canPlaceOnBlocks;
    }

    /** The Bedrock block identifiers this stack may destroy. */
    public getCanDestroyBlocks(): readonly string[] {
        return this.canDestroyBlocks;
    }

    /**
     * A copy of this stack holding different contents.
     *
     * @param contents - One entry per slot, null for an empty one.
     */
    public withContents(contents: readonly (Item | null)[]): Item {
        return this.copyWith({ contents });
    }

    /**
     * A copy of this stack with a different legacy auxiliary value.
     *
     * @param meta - The replacement auxiliary value, such as a transformed entity-interaction item.
     */
    public withMeta(meta: number): Item {
        return this.copyWith({ meta });
    }

    /**
     * A copy of this stack carrying a different enchantment set.
     *
     * A copy rather than a mutation: the anvil and the enchanting table both
     * compute a result before the player has paid for it, and a stack enchanted
     * in place would have been enchanted whether they paid or not.
     */
    public withEnchantments(levels: ReadonlyMap<string, number> | Readonly<Record<string, number>>): Item {
        return this.copyWith({ enchantments: levels });
    }

    /**
     * A copy of this stack with a different name and lore.
     *
     * @param customName - The new name, or undefined to go back to the item's own.
     */
    public withDisplay(customName: string | undefined, lore: readonly string[] = this.loreLines): Item {
        return this.copyWith({ customName, lore });
    }

    /**
     * A copy of this stack holding a different number of items.
     *
     * Everything else comes along: the enchantments, the durability spent, the name, the lore,
     * the contents and the content the stack reads its components from. A slot that changes
     * size goes through here, because the wire writes the item's count and not the slot's.
     *
     * The stack network id comes along too, because a stack that grows or shrinks is still the
     * stack the client knows: a Bedrock Dedicated Server 1.26.52 keeps the id on what is left
     * of a stack and on a stack merged onto. A part split off is a new stack, and the caller
     * clears the id on it.
     *
     * @param count - How many the copy holds. Set after construction, so zero stays zero.
     */
    public withCount(count: number): Item {
        const copy = this.copyWith({});
        copy.count = count;
        copy.stackNetworkId = this.stackNetworkId;
        return copy;
    }

    /** One copy constructor for the `with*` methods, so each states only what it changes. */
    private copyWith(changes: Partial<ItemProps>): Item {
        const copy = new Item({
            runtimeId: this.runtimeId,
            name: this.name,
            meta: this.meta,
            count: this.count,
            blockRuntimeId: this.placedBlockRuntimeId,
            content: this.content,
            enchantments: this.enchantmentLevels,
            customName: this.customName,
            lore: this.loreLines,
            canPlaceOnBlocks: this.canPlaceOnBlocks,
            canDestroyBlocks: this.canDestroyBlocks,
            contents: this.heldContents,
            ...changes
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
     * @param content - The content whose merged tags resolve this rule, defaulting to this stack's content.
     * @returns False for a bare name no rule covers, which is Java's answer too.
     */
    public harvests(block: string, content = this.content): boolean {
        const rules = this.type()?.params(tool)?.rules;
        if (!rules) return false;

        const tags: TagLookup | undefined = content?.tags;
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
    private wireId(itemData: ProtocolItemData): number {
        return this.getName() === 'minecraft:air' ? 0 : this.runtimeIdIn(itemData);
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
        writeItemStackDescriptor(stream, this.toStackDescriptor(stream, stackNetId));
    }

    /**
     * This stack as the six wire fields of a `NetworkItemStackDescriptor`.
     *
     * The descriptor is what travels in a declarative field list, which has no `Item` to hand
     * it; a packet class converts here and the bytes are the protocol package's to write. An
     * empty stack zeroes every field after the id, as {@link networkSerialize} always has.
     * @param stream - The stream the stack is bound for, which names the item numbering.
     * @param stackNetId - The stack's net id, when the receiver tracks one.
     * @returns The descriptor the stack goes out as.
     */
    public toStackDescriptor(stream: BinaryStream, stackNetId: number | null = null): ItemStackDescriptorData {
        const runtimeId = this.wireId(wireItemData(stream));
        const empty = runtimeId === 0;

        return {
            id: runtimeId,
            stackSize: empty ? 0 : this.getAmount(),
            auxValue: empty ? 0 : this.meta,
            stackNetId,
            blockRuntimeId: empty ? 0 : this.getBlockRuntimeId(),
            userData: empty ? Buffer.alloc(0) : this.extraData()
        };
    }

    /**
     * Writes an item stack in the form that carries no stack net id - an `ItemStack`.
     *
     * What the creative menu and every recipe carries, because nothing is tracking these
     * stacks. See {@link networkSerialize} for how the two forms differ beyond the flag.
     */
    public networkSerializeWithoutStackId(stream: BinaryStream): void {
        const runtimeId = this.wireId(wireItemData(stream));

        stream.writeVarInt(runtimeId);
        stream.writeUnsignedShortLE(runtimeId === 0 ? 0 : this.getAmount());
        stream.writeUnsignedVarInt(runtimeId === 0 ? 0 : this.meta);
        stream.writeVarInt(runtimeId === 0 ? 0 : this.getBlockRuntimeId());

        this.writeExtraData(stream, runtimeId !== 0);
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
     * What the client is told about this stack beyond its id, count and aux value.
     *
     * The enchantments, the name, the lore and the durability spent, in the shape
     * {@link itemUserDataTag} lays out. Null for a stack with none of them and no durability,
     * which is most of them and every slot of an untouched inventory.
     */
    public userDataTag(): NBTTagCompound | null {
        const limit = this.getMaxDurability();

        return itemUserDataTag({
            enchantments: this.enchantmentLevels,
            customName: this.customName,
            lore: this.loreLines,
            // Spent rather than remaining, which is what both editions store and what the
            // client draws the damage bar from. Written for every item that has durability,
            // zero included, as a Bedrock Dedicated Server 1.26.52 writes it.
            damage: limit > 0 ? Math.max(0, limit - this.durability) : undefined,
            // Through the stored form, so the `Items` list the client previews a shulker box
            // from is the same list the world record keeps.
            contents: this.heldContents.map((held) => (held === null ? null : storedItem(held))),
            enchantmentRegistry: this.content?.enchantments
        });
    }

    /**
     * The length prefixed `User Data Buffer`: the stack's `ItemInstanceUserData`, which
     * `@jsprismarine/protocol` lays out.
     *
     * The blob is the stack's own compound when it has one, its can-place-on and can-destroy
     * block lists, and the blocking tick required by `minecraft:blocks_attacks`. An empty stack
     * writes a bare zero length instead of the structure.
     *
     * A null compound used to go out here whatever the stack held, so an enchanted pickaxe,
     * a renamed sword and a lore line all arrived as the plain item. The mechanics ran on the
     * server and nothing about them reached the player.
     * @param {BinaryStream} stream - the stream to write to.
     * @param {boolean} present - whether this stack holds anything at all.
     */
    private writeExtraData(stream: BinaryStream, present: boolean): void {
        const blob = present ? this.extraData() : Buffer.alloc(0);
        stream.writeUnsignedVarInt(blob.byteLength);
        stream.write(blob);
    }

    /** The `User Data Buffer` bytes themselves; see {@link writeExtraData} for what is in them. */
    private extraData(): Buffer {
        const blob = new NetworkBinaryStream();
        const blocksAttacks = this.hasComponent('minecraft:blocks_attacks');
        new ItemInstanceUserData(this.userDataTag(), {
            canPlaceOnBlocks: [...this.canPlaceOnBlocks],
            canDestroyBlocks: [...this.canDestroyBlocks],
            ...(blocksAttacks ? { blockingTick: 0n } : {})
        }).serialize(blob);

        return blob.getBuffer();
    }

    /**
     * Reads an item stack off the wire.
     *
     * The layout is `NetworkItemStackDescriptor`, which `@jsprismarine/protocol` already
     * describes: the id, the count, the aux value, an **always present** flag saying whether
     * a stack net id follows, the block runtime id, and one length prefixed blob holding the
     * nbt and the can-place-on / can-break lists. All of it, even for air.
     *
     * The block lists are retained so a stack the client sends can be sent back with the same
     * adventure-mode restrictions. The NBT compound and optional shield blocking tick remain
     * unused here; the user-data structure isolates them from the following packet fields.
     *
     * Reading the flag is what keeps every field after it aligned. It used to be read only
     * when a caller asked for `extra`, which no caller ever did, so from that byte onwards
     * the reader was one out: the lists it then walked had garbage lengths, ran off the end
     * of the buffer and threw. Every InventoryTransaction died there - which is what left a
     * survival block break with no sound, the packet never reaching its handler.
     * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/network-item-stack-descriptor/
     */
    public static networkDeserialize(stream: BinaryStream): Item {
        return Item.fromStackDescriptor(stream, readItemStackDescriptor(stream));
    }

    /**
     * The stack a `NetworkItemStackDescriptor` describes.
     *
     * The counterpart of {@link toStackDescriptor}, for the packet classes that take their
     * stacks from a declarative field list rather than off the stream themselves.
     * @param stream - The stream the descriptor came off, which names the item numbering.
     * @param descriptor - The six wire fields.
     * @returns The stack, with an unknown id kept so it goes back out as the client sent it.
     */
    public static fromStackDescriptor(stream: BinaryStream, descriptor: ItemStackDescriptorData): Item {
        const userData = new ItemInstanceUserData();
        if (descriptor.userData.byteLength > 0) {
            userData.deserialize(new NetworkBinaryStream(descriptor.userData));
        }

        if (descriptor.id === 0) {
            return new Item({
                name: 'minecraft:air',
                canPlaceOnBlocks: userData.canPlaceOnBlocks,
                canDestroyBlocks: userData.canDestroyBlocks
            });
        }

        // Keep an unknown runtime id so a custom item goes back out with the
        // number the client's item registry assigned it.
        const item = new Item({
            runtimeId: descriptor.id,
            name: wireItemData(stream).nameOf(descriptor.id) ?? 'minecraft:unknown',
            meta: descriptor.auxValue,
            count: descriptor.stackSize,
            canPlaceOnBlocks: userData.canPlaceOnBlocks,
            canDestroyBlocks: userData.canDestroyBlocks
        });
        item.stackNetworkId = descriptor.stackNetId ?? 0;
        return item;
    }

    /**
     * Reads the form that carries no stack net id - the creative menu's.
     *
     * The counterpart to {@link networkSerializeWithoutStackId}; see it for why the two
     * forms exist and what confusing them costs.
     */
    public static networkDeserializeWithoutStackId(stream: BinaryStream): Item {
        // A varint id and a varint block runtime id, where the tracked form uses two fixed
        // bytes and an unsigned varint. That asymmetry, and the missing flag, is why the two
        // forms do not share a reader. Everything after is read whatever the id is: an empty
        // stack is no longer a bare zero, and stopping at the id leaves the rest of it to be
        // read as the next field.
        const id = stream.readVarInt();
        const stackSize = stream.readUnsignedShortLE();
        const auxValue = stream.readUnsignedVarInt();
        stream.readVarInt(); // Block runtime id, for the block this item places.

        return Item.fromStackDescriptor(stream, {
            id,
            stackSize,
            auxValue,
            stackNetId: null,
            blockRuntimeId: 0,
            userData: stream.read(stream.readUnsignedVarInt())
        });
    }
}
