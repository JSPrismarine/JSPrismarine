/**
 * Writing named item slots on players, mobs and container blocks, which is what `/replaceitem`,
 * `/item` and `/loot replace` ask for.
 *
 * A slot name means nothing until it meets what holds the slot: `container.0` is a player's
 * first hotbar slot and a chest minecart's first slot, and `slot.armor.body` is a horse's
 * armor slot and nothing on a player. `inventory/slotAddress.ts` reads every name against one
 * holder. This module opens each target as such a holder, reads and writes the slots it
 * resolves, and hands the change on: a player is sent its inventory, a block's container is
 * written back into its block entity, and a mob's write goes into its `EntityInventory`, whose
 * slot entries already log, save and replicate it.
 *
 * A target that lacks the slot is skipped, as Java skips it. A command fails only when no
 * target had it, with the sentence the resolver wrote for the last one.
 */
import type { ItemSlot, SlotTarget, SlotWriteMode } from '@jsprismarine/commands';
import type { ItemDrop } from '@jsprismarine/block-behaviors';
import type { ItemModifier, PredicateContext, ItemStack as PredicateItemStack } from '@jsprismarine/predicates';

import type Server from '../../Server';
import type { ServerContent } from '../../content/ServerContent';
import type { DataEntity } from '../../entity/data/DataEntity';
import { dropOfItem, itemOfDrop } from '../../inventory/persistence';
import type { HeldSlot, SlotHolder, SlotNameOptions, SlotRole } from '../../inventory/slotAddress';
import { SLOT_OFFSET_LIMIT, mobSlotHolder, resolveSlotName } from '../../inventory/slotAddress';
import { bedrockItemDrops } from '../../item/bedrockDrops';
import type { Item } from '../../item/Item';
import { itemFromContent } from '../../item/itemFromContent';
import { dropOfRolledStack, rolledStackOfDrop, withBedrockFields } from '../../item/lootStack';
import { lootLevelOf } from '../../world/lootLevel';
import { blockContainerAt } from './containers';
import { parseItemPredicateArgument } from './itemPredicate';
import { blockPositionOf, carryOut, refuse, resolveEntity, resolveTarget, worldOf } from './support';

/** One target opened for a command: what its slot names resolve against, and its slots. */
interface OpenedHolder {
    readonly holder: SlotHolder;
    /** What a resolved slot holds, or null when it is empty. */
    get(slot: HeldSlot): Item | null;
    /** Puts a stack in a resolved slot, or empties it. */
    set(slot: HeldSlot, item: Item | null): void;
    /** Hands the writes on: sends a player its inventory, or writes a block's container back. */
    finish(): void;
}

/** A mob opened for a command: its slots, and the alias a mount's armor slot takes. */
const mobHolder = (entity: DataEntity): OpenedHolder => {
    const { body } = entity;
    const holder = mobSlotHolder(entity);

    return {
        holder,
        get: (slot) =>
            slot.container === 'block' ? null : (body.inventory.slotItem(slot.container, slot.slot) ?? null),
        set: (slot, item) => {
            if (slot.container === 'block') return;
            body.inventory.containerNamed(slot.container)?.set(slot.slot, item);
            if (!('alias' in slot) || slot.alias === undefined) return;
            // A mount's armor or carpet goes in its own container slot, and the body reads it from
            // there, as equipping it by hand leaves it.
            if (item !== null) body.equipmentInventorySlots.set(slot.alias, slot.slot);
            else if (body.equipmentInventorySlots.get(slot.alias) === slot.slot)
                body.equipmentInventorySlots.delete(slot.alias);
        },
        finish: () => {}
    };
};

/**
 * Opens one target.
 *
 * @returns The holder; undefined for an entity that has since gone, which a command skips.
 * @throws {CommandSyntaxException} When a block target is not a container, which Java refuses
 *   outright.
 */
const openTarget = (server: Server, target: SlotTarget, role: SlotRole): OpenedHolder | undefined => {
    if (target.kind === 'block') {
        const at = blockPositionOf(target.position);
        const container = blockContainerAt(server, worldOf(server, target.dimension), at);
        if (container === undefined) {
            refuse(
                `${role === 'source' ? 'Source' : 'Target'} position ${at.getX()}, ${at.getY()}, ${at.getZ()} is not a container`
            );
        }
        const content = server.getContent();
        return {
            holder: { kind: 'block', size: container.size },
            get: (slot) => {
                const drop = container.get(slot.slot);
                return drop === undefined ? null : itemOfDrop(drop, content);
            },
            set: (slot, item) => container.set(slot.slot, dropOfItem(item)),
            finish: () => container.commit()
        };
    }

    const player = resolveTarget(server, target.entity);
    if (player !== undefined) {
        const inventory = player.player.getInventory();
        return {
            holder: { kind: 'player', inventory },
            get: (slot) =>
                slot.container === 'block' ? null : (inventory.slotItem(slot.container, slot.slot) ?? null),
            set: (slot, item) => {
                if (slot.container !== 'block') inventory.containerNamed(slot.container)?.set(slot.slot, item);
            },
            finish: () => carryOut(player.session.sendInventory(), undefined)
        };
    }

    const actor = resolveEntity(server, target.entity);
    return actor === undefined ? undefined : mobHolder(actor.entity);
};

/** A copy of a stack for another slot: the same item, and a stack the client has not named yet. */
const copyOf = (item: Item): Item => {
    const copy = item.withCount(item.getAmount());
    copy.stackNetworkId = 0;
    return copy;
};

/**
 * Puts stacks into resolved slots the way a {@link SlotWriteMode} says.
 *
 * @param stacks - What goes in, in order; null empties a slot.
 * @returns How many slots were written.
 */
const writeSlots = (
    opened: OpenedHolder,
    slots: readonly HeldSlot[],
    stacks: readonly (Item | null)[],
    mode: SlotWriteMode
): number => {
    let written = 0;
    for (const [index, slot] of slots.entries()) {
        const next =
            mode === 'fill'
                ? stacks[index % Math.max(1, stacks.length)]
                : index < stacks.length
                  ? stacks[index]
                  : mode === 'override'
                    ? null
                    : undefined;
        if (next === undefined) continue;
        if (mode === 'keep' && opened.get(slot) !== null) continue;
        opened.set(slot, next === null ? null : copyOf(next));
        written += 1;
    }
    return written;
};

/**
 * Resolves a name on every target and runs `visit` on each target that has it.
 *
 * @param required - Whether a name no target has fails the command. `/loot replace` walking on
 *   past the named slot skips the slots a target runs out of instead.
 * @throws {CommandSyntaxException} When it is required, there were targets and none had the
 *   slot, with the resolver's sentence for the last one.
 */
const eachHolding = (
    server: Server,
    targets: readonly SlotTarget[],
    slot: ItemSlot,
    options: SlotNameOptions,
    visit: (opened: OpenedHolder, slots: readonly HeldSlot[], target: SlotTarget) => void,
    required = true
): void => {
    let refusal: string | undefined;
    let held = false;
    for (const target of targets) {
        const opened = openTarget(server, target, options.role ?? 'target');
        if (opened === undefined) continue;
        const resolved = resolveSlotName(slot, opened.holder, options);
        if (!resolved.ok) {
            refusal = resolved.refusal;
            continue;
        }
        held = true;
        visit(opened, resolved.slots, target);
        opened.finish();
    }
    if (required && !held && refusal !== undefined) refuse(refusal);
};

/** The item a command named as a stack of `count`, null for air, or undefined when no pack declares it. */
const stackOf = (server: Server, item: string, count: number): Item | null | undefined => {
    const registered = itemFromContent(item.includes(':') ? item : `minecraft:${item}`, server.getContent());
    if (registered === null) return undefined;
    // Air empties the slot rather than filling it with a stack of nothing, which is how Java
    // clears one.
    return registered.getName() === 'minecraft:air' ? null : registered.withCount(count);
};

/**
 * Puts an item stack in the slots a name covers, on every target.
 *
 * @param slot - Java's name, or Bedrock's group with its index.
 * @param mode - What to do with what is there, and how the stack spreads over a wildcard.
 * @returns How many slots were written, which is zero when `keep` left every one alone.
 * @throws {CommandSyntaxException} When the name is not a slot, no target has it, or a block
 *   target is not a container.
 */
export const setItemSlot = (
    server: Server,
    targets: readonly SlotTarget[],
    slot: ItemSlot,
    item: string,
    count: number,
    mode: SlotWriteMode = 'replace'
): number => {
    const stack = stackOf(server, item, count);
    if (stack === undefined) return 0;

    let written = 0;
    eachHolding(server, targets, slot, {}, (opened, slots) => {
        written += writeSlots(opened, slots, [stack], mode);
    });
    return written;
};

/**
 * A stack as the loot and predicate grammars read one: what it carries, through the translation
 * a rolled drop takes backwards, and what its item type declares, such as its maximum
 * durability, which `set_damage` and a `damage` predicate read.
 *
 * @param drop - The stack as a drop, when the caller already made one.
 */
const predicateStackOf = (item: Item, drop: ItemDrop | undefined = dropOfItem(item)): PredicateItemStack => {
    const declared = item.asPredicateStack();
    if (drop === undefined) return declared;
    const rolled = rolledStackOfDrop(drop);
    return { ...rolled, components: new Map([...declared.components, ...rolled.components]) };
};

/**
 * Counts the items in the slots a name covers on every source that pass an item predicate,
 * which is `execute if items`.
 *
 * Java's `ExecuteCommand.countItems`: the counts of the matching stacks, summed over the
 * sources. A source without the slot adds nothing rather than failing the condition.
 *
 * @param predicate - Java's `item_predicate` argument.
 * @throws {CommandSyntaxException} When the predicate cannot be read, or a block source is not
 *   a container.
 */
export const countSlotItems = (
    server: Server,
    sources: readonly SlotTarget[],
    slot: ItemSlot,
    predicate: string
): number => {
    const matches = parseItemPredicateArgument(predicate, server.getContent().loot);

    let count = 0;
    eachHolding(
        server,
        sources,
        slot,
        { role: 'source' },
        (opened, slots) => {
            for (const held of slots) {
                const item = opened.get(held);
                if (item !== null && matches(predicateStackOf(item))) count += item.getAmount();
            }
        },
        false
    );
    return count;
};

/**
 * A datapack's item modifier, compiled for one command.
 *
 * @throws {CommandSyntaxException} When no loaded datapack declares it, which is Java's
 *   refusal of an unknown id.
 */
const itemModifierNamed = (server: Server, id: string): ItemModifier => {
    const name = id.includes(':') ? id : `minecraft:${id}`;
    const content = server.getContent();
    if (!content.definitions.itemModifiers.has(name)) refuse(`Unknown item modifier: ${name}`);
    return content.loot.itemModifier(name, `item_modifier/${name}`);
};

/**
 * The context a modifier runs in for a slot on one target: Java's `command` parameter set,
 * with the origin at the target, since the host is not told where the command ran.
 */
const modifierContext = (content: ServerContent, server: Server, target: SlotTarget): PredicateContext => {
    const { dimension, position } = target.kind === 'block' ? target : target.entity;
    return content.loot.context(undefined, {
        parameterSet: 'command',
        parameters: { origin: { x: position.x, y: position.y, z: position.z } },
        level: lootLevelOf(worldOf(server, dimension))
    });
};

/**
 * A stack run through an item modifier, which is Java's `ItemCommands.applyModifier`.
 *
 * The stack goes out as the loot grammar reads one and comes back through the same translation
 * a rolled drop takes, so a name, lore, enchantments, durability and a shulker box's contents
 * survive the trip. What Bedrock keeps on a stack that Java has no component for here, such as
 * the blocks it may be placed on and its lock, is carried across from the stack as it was.
 *
 * @returns The modified stack, cut down to the item's stack size as Java cuts it, or null when
 *   the modifier emptied it.
 */
const modifiedItem = (server: Server, modifier: ItemModifier, item: Item, target: SlotTarget): Item | null => {
    const drop = dropOfItem(item);
    if (drop === undefined) return null;
    const content = server.getContent();

    const result = modifier(predicateStackOf(item, drop), modifierContext(content, server, target));
    if (result === undefined || result.count <= 0) return null;

    const [translated] = bedrockItemDrops([dropOfRolledStack(result)]);
    if (translated === undefined) return null;
    // The fields the translation does not carry, which a modifier cannot have changed.
    const modified = itemOfDrop(withBedrockFields(drop, translated), content);
    if (modified === null || modified.getAmount() <= modified.getMaxAmount()) return modified;
    return modified.withCount(modified.getMaxAmount());
};

/**
 * Runs an item modifier over the stacks in the slots a name covers, on every target, which is
 * `/item modify`.
 *
 * An empty slot is left alone: there is no stack for the modifier to change.
 *
 * @returns How many slots were written.
 * @throws {CommandSyntaxException} When the name is not a slot, no target has it, a block target
 *   is not a container, or no datapack declares the modifier.
 */
export const modifyItemSlots = (
    server: Server,
    targets: readonly SlotTarget[],
    slot: ItemSlot,
    modifier: string
): number => {
    const named = itemModifierNamed(server, modifier);

    let written = 0;
    eachHolding(server, targets, slot, {}, (opened, slots, target) => {
        for (const held of slots) {
            const item = opened.get(held);
            if (item === null) continue;
            opened.set(held, modifiedItem(server, named, item, target));
            written += 1;
        }
    });
    return written;
};

/**
 * Copies the stacks in the slots one name covers on the sources into the slots another covers
 * on every target, which is `/item replace|fill|override … from`.
 *
 * @returns How many slots were written.
 * @param modifier - The id of an item modifier each stack goes through on the way, which runs
 *   at the source the stack came from.
 * @throws {CommandSyntaxException} When a name is not a slot, no source or no target has it, a
 *   block is not a container, or no datapack declares the modifier.
 */
export const copyItemSlots = (
    server: Server,
    sources: readonly SlotTarget[],
    fromSlot: ItemSlot,
    targets: readonly SlotTarget[],
    toSlot: ItemSlot,
    mode: Exclude<SlotWriteMode, 'destroy' | 'keep'> = 'replace',
    modifier?: string
): number => {
    const named = modifier === undefined ? undefined : itemModifierNamed(server, modifier);

    // Every source slot, empty ones included, so copying an empty hand empties the target.
    const stacks: (Item | null)[] = [];
    eachHolding(server, sources, fromSlot, { role: 'source' }, (opened, slots, source) => {
        for (const slot of slots) {
            const held = opened.get(slot);
            stacks.push(held === null || named === undefined ? held : modifiedItem(server, named, held, source));
        }
    });

    let written = 0;
    eachHolding(server, targets, toSlot, {}, (opened, slots) => {
        written += writeSlots(opened, slots, stacks, mode);
    });
    return written;
};

/**
 * Writes rolled loot into consecutive slots from the one named, on every target, which is
 * `/loot replace`.
 *
 * Java's `LootCommand.entityReplace` and `blockReplace`: slot `i` from the named one takes the
 * `i`th stack, and with a count larger than the roll the slots past the last stack are emptied.
 * A slot the target lacks is skipped.
 *
 * @param stacks - What was rolled, in order; null for a drop no pack declares.
 * @param count - How many slots to write; the number of stacks when the command named none.
 * @returns How many items went in.
 * @throws {CommandSyntaxException} When the name is not one slot, or no target has it.
 */
export const replaceWithLoot = (
    server: Server,
    targets: readonly SlotTarget[],
    slot: ItemSlot,
    stacks: readonly (Item | null)[],
    count: number = stacks.length
): number => {
    let placed = 0;
    // Java walks every slot the count names; past the last slot any holder has there is nothing
    // to write, so a count of 2147483647 stops there rather than holding up the tick.
    const reach = Math.min(count, SLOT_OFFSET_LIMIT);
    for (let offset = 0; offset < reach; offset += 1) {
        const stack = stacks[offset] ?? null;
        eachHolding(
            server,
            targets,
            slot,
            { single: true, offset },
            (opened, slots) => {
                for (const held of slots) {
                    opened.set(held, stack === null ? null : copyOf(stack));
                    placed += stack?.getAmount() ?? 0;
                }
            },
            offset === 0
        );
    }
    return placed;
};
