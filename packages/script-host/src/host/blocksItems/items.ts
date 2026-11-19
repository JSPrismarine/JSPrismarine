/**
 * The `@minecraft/server` members of item stacks beyond the ones `serverItems.ts` registers, and
 * the item components: an `ItemStack`'s type facts, what it can break and be placed on, its lock,
 * cloning and matching, and the enchantable, food, cooldown, compostable, dyeable, potion, book
 * and block dynamic property components. `ContainerSlot` shares the stack members over the stack
 * its slot holds.
 *
 * A type's facts come from the world's catalog. The edge cases follow the `item-members` and
 * `containers` scenarios recorded on the pinned Bedrock Dedicated Server.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { ScriptApiError } from '../../errors';
import type { ScriptApiImplementations, ScriptCall } from '../../shape/implementations';
import type { ScriptValue } from '../../values';
import { ScriptHandle } from '../../values';
import type { PackHost } from '../minecraftServer';
import { itemOf, itemState, plainError, SERVER, TAG, withNamespace } from '../serverObjects';
import { CONVERTS_VALUE, propertyValueOf, scriptValueOf } from '../serverProperties';
import type { ScriptBookPage, ScriptEnchantmentInfo, ScriptItem, ScriptItemInfo, ScriptPropertyValue } from '../world';
import { objectArray } from './handles';
import { sameExtras } from './itemExtras';
import { linkedComponent, withLinkedStack } from './itemLink';
import { BLOCK_ITEM_TAG } from './tags';
import { enchantmentId, typeArgument } from './types';

/** The class of each item component the host has behavior for, by its id. */
const ITEM_COMPONENTS: ReadonlyMap<string, string> = new Map([
    ['minecraft:durability', 'ItemDurabilityComponent'],
    ['minecraft:enchantable', 'ItemEnchantableComponent'],
    ['minecraft:food', 'ItemFoodComponent'],
    ['minecraft:cooldown', 'ItemCooldownComponent'],
    ['minecraft:compostable', 'ItemCompostableComponent'],
    ['minecraft:dyeable', 'ItemDyeableComponent'],
    ['minecraft:potion', 'ItemPotionComponent'],
    ['minecraft:book', 'ItemBookComponent'],
    ['minecraft:block_actor_dynamic_properties', 'ItemBlockDynamicPropertiesComponent']
]);

/** How a member reads and writes the stack it works on: an `ItemStack`'s own, or a slot's. */
export interface StackAccess {
    read(call: ScriptCall): ScriptItem;
    write(call: ScriptCall, item: ScriptItem): void;
}

/** Whether two stacks hold the same items: the same type, name, lore, damage and every extra part. */
export const sameItems = (a: ScriptItem, b: ScriptItem): boolean =>
    a.typeId === b.typeId &&
    a.nameTag === b.nameTag &&
    JSON.stringify(a.lore ?? []) === JSON.stringify(b.lore ?? []) &&
    (a.damage ?? 0) === (b.damage ?? 0) &&
    (a.dynamicProperties?.size ?? 0) === 0 &&
    (b.dynamicProperties?.size ?? 0) === 0 &&
    sameExtras(a, b);

/** Whether two stacks merge into one slot: items of a type that stacks, and the same items. */
export const stackable = (a: ScriptItem, b: ScriptItem, info: ScriptItemInfo | undefined): boolean =>
    (info?.stackable ?? true) && sameItems(a, b);

/** The ids a `setCanDestroy` or `setCanPlaceOn` list argument names, which the engine copies as JSON. */
const blockListArgument = (call: ScriptCall): string[] => {
    const value = call.args[0];
    if (value === undefined || value === null) return [];
    const json = call.stringify(value);
    // The engine wrote the string with JSON.stringify, and the binding checked it is a string array.
    const parsed: unknown = json === undefined ? [] : JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((each) => typeof each === 'string') : [];
};

/** A copy of a stack without one extra part. */
const without = <Key extends keyof ScriptItem>(item: ScriptItem, key: Key): Omit<ScriptItem, Key> => {
    const { [key]: _gone, ...rest } = item;
    return rest;
};

/**
 * Registers the members `ItemStack` and `ContainerSlot` share, over the stack each reaches.
 * @param owner - The class.
 * @param access - How the class reads and writes its stack.
 */
export const implementStackMembers = (
    implementations: ScriptApiImplementations,
    host: PackHost,
    owner: 'ItemStack' | 'ContainerSlot',
    access: StackAccess
): void => {
    const { world } = host;
    const info = (item: ScriptItem): ScriptItemInfo | undefined => world.catalog?.itemType(item.typeId);
    /** Checks each id names a block and keeps it without `minecraft:`, the last given first, as BDS lists them. */
    const blockList = (call: ScriptCall, member: string): string[] => {
        const ids = blockListArgument(call);
        const kept: string[] = [];
        for (const id of ids) {
            const full = withNamespace(id);
            const known = world.catalog?.blockType(full) !== undefined || world.resolveBlock(full, {}) !== undefined;
            if (!known) throw plainError(`Function ${member} failed. Invalid block identifier provided.`);
            const bare = full.startsWith('minecraft:') ? full.slice('minecraft:'.length) : full;
            if (!kept.includes(bare)) kept.unshift(bare);
        }
        return kept;
    };
    const change = (call: ScriptCall, edit: (item: ScriptItem) => ScriptItem): void =>
        access.write(call, edit(access.read(call)));

    implementations
        .implement(SERVER, owner, 'getCanDestroy', (call) => JSON.stringify(access.read(call).canDestroy ?? []))
        .implement(SERVER, owner, 'getCanPlaceOn', (call) => JSON.stringify(access.read(call).canPlaceOn ?? []))
        .implement(SERVER, owner, 'setCanDestroy', (call) => {
            const ids = blockList(call, 'setCanDestroy');
            change(call, (item) => (ids.length === 0 ? without(item, 'canDestroy') : { ...item, canDestroy: ids }));
            return undefined;
        })
        .implement(SERVER, owner, 'setCanPlaceOn', (call) => {
            const ids = blockList(call, 'setCanPlaceOn');
            change(call, (item) => (ids.length === 0 ? without(item, 'canPlaceOn') : { ...item, canPlaceOn: ids }));
            return undefined;
        })
        .implement(SERVER, owner, 'keepOnDeath', {
            get: (call) => access.read(call).keepOnDeath === true,
            set: (call) =>
                change(call, (item) =>
                    call.args[0] === true ? { ...item, keepOnDeath: true } : without(item, 'keepOnDeath')
                )
        })
        .implement(SERVER, owner, 'lockMode', {
            get: (call) => access.read(call).lockMode ?? 'none',
            set: (call) => {
                const [mode] = call.args;
                change(call, (item) =>
                    mode === 'inventory' || mode === 'slot' ? { ...item, lockMode: mode } : without(item, 'lockMode')
                );
            }
        })
        .implement(SERVER, owner, 'getRawLore', (call) =>
            JSON.stringify((access.read(call).lore ?? []).map((text) => ({ text })))
        )
        .implement(SERVER, owner, 'getTags', (call) => JSON.stringify(info(access.read(call))?.tags ?? []))
        .implement(SERVER, owner, 'hasTag', (call) => {
            const tag = String(call.args[0]);
            const tags = info(access.read(call))?.tags ?? [];
            // A tag in the `minecraft` namespace also answers to its bare name.
            return tags.includes(tag) || tags.includes(withNamespace(tag));
        })
        .implement(SERVER, owner, 'isStackableWith', (call) => {
            const item = access.read(call);
            const other = itemOf(call.stateOf(call.args[0] ?? null));
            return stackable(item, other, info(item));
        });
};

/**
 * Registers the `ItemStack` members and the item components.
 * @param implementations - The pack's implementations, which this adds to.
 * @param host - The pack's view of the runtime and the world.
 */
export const implementItemMembers = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const { world } = host;
    const info = (item: ScriptItem): ScriptItemInfo | undefined => world.catalog?.itemType(item.typeId);
    const stackOf = (call: ScriptCall): ScriptItem => itemOf(call.state);
    implementStackMembers(implementations, host, 'ItemStack', {
        read: stackOf,
        write: (call, item) => call.setState(itemState(item))
    });

    /** The ids of the components a stack has that the host has behavior for, in the catalog's order. */
    const componentsOf = (item: ScriptItem): string[] => {
        const listed = info(item)?.components;
        if (listed === undefined) {
            // A world without a catalog knows only an item's durability.
            return world.itemType(item.typeId)?.maxDurability === undefined ? [] : ['minecraft:durability'];
        }
        // BDS's written book has the book component the capture's empty one lacked.
        const book = item.typeId === WRITTEN_BOOK && !listed.includes('minecraft:book') ? ['minecraft:book'] : [];
        return [...listed, ...book].filter((id) => ITEM_COMPONENTS.has(id));
    };
    const componentObject = (call: ScriptCall, id: string): ScriptHandle => {
        if (id === 'minecraft:durability')
            return linkedComponent(host, call, 'ItemDurabilityComponent', TAG.durability);
        return linkedComponent(host, call, ITEM_COMPONENTS.get(id) ?? '', BLOCK_ITEM_TAG.itemComponent, id);
    };
    /** Changes the stack a component belongs to. */
    const changeLinked = (call: ScriptCall, edit: (item: ScriptItem) => ScriptItem): void =>
        withLinkedStack(call, (stack, item) => call.setStateOf(stack, itemState(edit(item))));
    const linkedInfo = (call: ScriptCall): ScriptItemInfo | undefined =>
        withLinkedStack(call, (_stack, item) => info(item));

    implementations
        .implement(SERVER, 'ItemStack', 'getComponent', (call) => {
            const id = withNamespace(String(call.args[0]));
            return componentsOf(stackOf(call)).includes(id)
                ? host.engine.release(componentObject(call, id))
                : undefined;
        })
        .implement(SERVER, 'ItemStack', 'hasComponent', (call) =>
            componentsOf(stackOf(call)).includes(withNamespace(String(call.args[0])))
        )
        .implement(SERVER, 'ItemStack', 'getComponents', (call) =>
            objectArray(
                host,
                componentsOf(stackOf(call)).map((id) => componentObject(call, id))
            )
        )
        // A clone leaves out the blocks the stack can break and be placed on, as the scenario recorded.
        .implement(SERVER, 'ItemStack', 'clone', (call) => {
            const { canDestroy: _destroy, canPlaceOn: _place, ...copy } = stackOf(call);
            return host.engine.release(host.create('ItemStack', TAG.itemStack, itemState(copy)));
        })
        .implement(SERVER, 'ItemStack', 'type', {
            get: (call) => host.engine.release(host.create('ItemType', TAG.itemType, stackOf(call).typeId))
        })
        .implement(SERVER, 'ItemStack', 'localizationKey', {
            get: (call) => info(stackOf(call))?.localizationKey ?? ''
        })
        .implement(SERVER, 'ItemStack', 'maxAmount', {
            get: (call) => {
                const item = stackOf(call);
                return info(item)?.maxAmount ?? world.itemType(item.typeId)?.maxStackSize ?? 64;
            }
        })
        .implement(SERVER, 'ItemStack', 'isStackable', {
            get: (call) => {
                const item = stackOf(call);
                return info(item)?.stackable ?? (world.itemType(item.typeId)?.maxStackSize ?? 1) > 1;
            }
        })
        // A stack weighs its type's weight once for each item in it.
        .implement(SERVER, 'ItemStack', 'weight', {
            get: (call) => {
                const item = stackOf(call);
                return (info(item)?.weight ?? 1) * item.amount;
            }
        })
        .implement(SERVER, 'ItemStack', 'matches', (call) => {
            const item = stackOf(call);
            if (item.typeId !== withNamespace(String(call.args[0]))) return false;
            const json = call.args[1] === undefined || call.args[1] === null ? undefined : call.stringify(call.args[1]);
            // The engine wrote the string with JSON.stringify. A stack has no block states to match.
            const states: unknown = json === undefined ? {} : JSON.parse(json);
            return typeof states === 'object' && states !== null && Object.keys(states).length === 0;
        })
        .implement(SERVER, 'ItemDurabilityComponent', 'getDamageChance', (call) => {
            const [level] = call.args;
            const chances = linkedInfo(call)?.durability?.damageChance ?? [100];
            return chances[typeof level === 'number' ? Math.trunc(level) : 0] ?? chances[0] ?? 100;
        })
        // BDS fails to read the range for every item, as the `item-members` scenario recorded.
        .implement(SERVER, 'ItemDurabilityComponent', 'getDamageChanceRange', () => {
            throw plainError("Failed to get property 'damageRange'.");
        })
        .implement(SERVER, 'ItemDurabilityComponent', 'unbreakable', {
            get: (call) => withLinkedStack(call, (_stack, item) => item.unbreakable === true),
            set: (call) =>
                changeLinked(call, (item) =>
                    call.args[0] === true ? { ...item, unbreakable: true } : without(item, 'unbreakable')
                )
        })
        .implement(SERVER, 'ItemFoodComponent', 'nutrition', { get: (call) => linkedInfo(call)?.food?.nutrition ?? 0 })
        .implement(SERVER, 'ItemFoodComponent', 'saturationModifier', {
            get: (call) => linkedInfo(call)?.food?.saturationModifier ?? 0
        })
        .implement(SERVER, 'ItemFoodComponent', 'canAlwaysEat', {
            get: (call) => linkedInfo(call)?.food?.canAlwaysEat ?? false
        })
        .implement(SERVER, 'ItemFoodComponent', 'usingConvertsTo', {
            get: (call) => linkedInfo(call)?.food?.usingConvertsTo ?? ''
        })
        .implement(SERVER, 'ItemCompostableComponent', 'compostingChance', {
            get: (call) => linkedInfo(call)?.compostable?.chance ?? 0
        })
        .implement(SERVER, 'ItemDyeableComponent', 'defaultColor', {
            get: (call) => {
                const color = linkedInfo(call)?.dyeable?.defaultColor;
                return color === undefined ? undefined : JSON.stringify(color);
            }
        })
        .implement(SERVER, 'ItemDyeableComponent', 'color', {
            get: (call) =>
                withLinkedStack(call, (_stack, item) =>
                    item.dyeColor === undefined ? undefined : JSON.stringify(item.dyeColor)
                ),
            set: (call) => {
                const json = call.args[0] === undefined ? undefined : call.stringify(call.args[0]);
                // The engine wrote the string with JSON.stringify, and the binding checked it is an RGB.
                const color: unknown = json === undefined ? undefined : JSON.parse(json);
                changeLinked(call, (item) => {
                    if (typeof color !== 'object' || color === null) return without(item, 'dyeColor');
                    const { red, green, blue } = { red: 0, green: 0, blue: 0, ...color };
                    return { ...item, dyeColor: { red: Number(red), green: Number(green), blue: Number(blue) } };
                });
            }
        });

    implementCooldown(implementations, host, linkedInfo);
    implementEnchantable(implementations, host, changeLinked);
    implementPotion(implementations, host);
    implementBook(implementations, host, changeLinked);
    implementBlockProperties(implementations, changeLinked);
};

/** The cooldowns a pack's scripts started, by player and category, with the tick each ends on. */
const implementCooldown = (
    implementations: ScriptApiImplementations,
    host: PackHost,
    linkedInfo: (call: ScriptCall) => ScriptItemInfo | undefined
): void => {
    const ends = new Map<string, number>();
    const keyOf = (call: ScriptCall, category: string): string => `${call.stateOf(call.args[0] ?? null)}\n${category}`;
    const category = (call: ScriptCall): string => linkedInfo(call)?.cooldown?.category ?? '';
    implementations
        .implement(SERVER, 'ItemCooldownComponent', 'cooldownCategory', { get: category })
        .implement(SERVER, 'ItemCooldownComponent', 'cooldownTicks', {
            get: (call) => linkedInfo(call)?.cooldown?.ticks ?? 0
        })
        .implement(SERVER, 'ItemCooldownComponent', 'isCooldownCategory', (call) => {
            const own = category(call);
            const asked = String(call.args[0]);
            return own === asked || own === withNamespace(asked);
        })
        .implement(SERVER, 'ItemCooldownComponent', 'startCooldown', (call) => {
            const ticks = linkedInfo(call)?.cooldown?.ticks ?? 0;
            ends.set(keyOf(call, category(call)), host.currentTick() + ticks);
            return undefined;
        })
        .implement(SERVER, 'ItemCooldownComponent', 'getCooldownTicksRemaining', (call) =>
            Math.max(0, (ends.get(keyOf(call, category(call))) ?? 0) - host.currentTick())
        );
};

/** An `Enchantment` argument: its type's id and its level. */
interface EnchantmentArgument {
    readonly id: string;
    readonly level: number;
}

/** Reads an `Enchantment` a script passed, whose type is an `EnchantmentType` or its id. */
const enchantmentArgument = (call: ScriptCall, value: ScriptValue | undefined): EnchantmentArgument => {
    if (!(value instanceof ScriptHandle)) {
        throw new ScriptHostErrors.ArgumentConversionFailed({ index: 0, expected: 'Enchantment' });
    }
    const type = call.engine.get(value, 'type');
    const level = call.engine.get(value, 'level');
    try {
        return {
            id: enchantmentId(typeArgument(call, type)),
            level: typeof level === 'number' ? Math.trunc(level) : 0
        };
    } finally {
        if (type instanceof ScriptHandle) call.engine.free(type);
    }
};

/** BDS's error for a level past an enchantment's range, as it words making one and adding one. */
const levelOutOfBounds = (when: 'create' | 'add', level: number, type: ScriptEnchantmentInfo): ScriptApiError =>
    new ScriptApiError(
        SERVER,
        'EnchantmentLevelOutOfBoundsError',
        `When trying to ${when} enchantment instance - Tyring to set enchantment level to ${level}, ` +
            `range for type ${type.id} is [0 - ${type.maxLevel}].`
    );

const implementEnchantable = (
    implementations: ScriptApiImplementations,
    host: PackHost,
    changeLinked: (call: ScriptCall, edit: (item: ScriptItem) => ScriptItem) => void
): void => {
    const { world } = host;
    const typeOf = (id: string): ScriptEnchantmentInfo | undefined =>
        world.catalog?.enchantments().find((each) => each.id === id);
    const known = (id: string): ScriptEnchantmentInfo => {
        const found = typeOf(id);
        if (found === undefined) throw plainError('Unknown enchantment type ID.');
        return found;
    };
    const enchantmentObject = (id: string, level: number): ScriptHandle => {
        const made = host.engine.evaluate('({})');
        if (!(made instanceof ScriptHandle)) throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'object' });
        host.engine.set(made, 'type', host.instance('EnchantmentType', BLOCK_ITEM_TAG.enchantmentType, id));
        host.engine.set(made, 'level', level);
        return made;
    };
    /**
     * Whether a stack takes an enchantment: false for an item it does not go on, and BDS's error
     * for a level out of range, one that conflicts with an enchantment the stack has, or one that
     * would take the stack's own level of it past the maximum.
     */
    const check = (item: ScriptItem, { id, level }: EnchantmentArgument): boolean => {
        const type = known(id);
        if (level > type.maxLevel) throw levelOutOfBounds('create', level, type);
        if (!type.items.includes(item.typeId)) return false;
        for (const held of item.enchantments ?? []) {
            if (held.id === id) {
                if (held.level + level > type.maxLevel) throw levelOutOfBounds('add', held.level + level, type);
            } else if (type.conflicts.includes(held.id)) {
                throw levelOutOfBounds('add', level, type);
            }
        }
        return true;
    };
    /** Adds or replaces an enchantment on a stack, after BDS's checks. */
    const add = (item: ScriptItem, enchantment: EnchantmentArgument): ScriptItem => {
        const type = known(enchantment.id);
        if (enchantment.level > type.maxLevel) throw levelOutOfBounds('create', enchantment.level, type);
        if (!type.items.includes(item.typeId)) {
            throw new ScriptApiError(
                SERVER,
                'EnchantmentTypeNotCompatibleError',
                `Enchantment of type ${type.id} is not compatible with item.`
            );
        }
        const held = item.enchantments ?? [];
        if (held.some((each) => each.id !== type.id && type.conflicts.includes(each.id))) {
            throw levelOutOfBounds('add', enchantment.level, type);
        }
        // Adding one the stack has replaces its level, where it was.
        const next = held.some((each) => each.id === type.id)
            ? held.map((each) => (each.id === type.id ? { id: each.id, level: enchantment.level } : each))
            : [...held, { id: type.id, level: enchantment.level }];
        return { ...item, enchantments: next };
    };
    const typeIdArgument = (call: ScriptCall): string => enchantmentId(typeArgument(call, call.args[0]));

    implementations
        .implement(SERVER, 'ItemEnchantableComponent', 'slots', {
            // BDS hands back one undefined entry per slot, as the scenario recorded.
            get: (call) =>
                withLinkedStack(call, (_stack, item) => {
                    const count = world.catalog?.itemType(item.typeId)?.enchantable?.slots.length ?? 0;
                    const array = host.engine.evaluate(`Array.from({ length: ${count} })`);
                    return array instanceof ScriptHandle ? host.engine.release(array) : array;
                })
        })
        .implement(SERVER, 'ItemEnchantableComponent', 'addEnchantment', (call) => {
            const enchantment = enchantmentArgument(call, call.args[0]);
            changeLinked(call, (item) => add(item, enchantment));
            return undefined;
        })
        .implement(SERVER, 'ItemEnchantableComponent', 'addEnchantments', (call) => {
            const list = call.args[0];
            const length = list instanceof ScriptHandle ? call.engine.get(list, 'length') : 0;
            const enchantments: EnchantmentArgument[] = [];
            for (let index = 0; list instanceof ScriptHandle && index < Number(length); index++) {
                const each = call.engine.get(list, String(index));
                try {
                    enchantments.push(enchantmentArgument(call, each));
                } finally {
                    if (each instanceof ScriptHandle) call.engine.free(each);
                }
            }
            changeLinked(call, (item) => enchantments.reduce(add, item));
            return undefined;
        })
        .implement(SERVER, 'ItemEnchantableComponent', 'canAddEnchantment', (call) => {
            const enchantment = enchantmentArgument(call, call.args[0]);
            return withLinkedStack(call, (_stack, item) => check(item, enchantment));
        })
        .implement(SERVER, 'ItemEnchantableComponent', 'getEnchantment', (call) => {
            const id = typeIdArgument(call);
            const found = withLinkedStack(call, (_stack, item) => item.enchantments?.find((each) => each.id === id));
            return found === undefined ? undefined : host.engine.release(enchantmentObject(found.id, found.level));
        })
        .implement(SERVER, 'ItemEnchantableComponent', 'getEnchantments', (call) =>
            objectArray(
                host,
                withLinkedStack(call, (_stack, item) => item.enchantments ?? []).map((each) =>
                    enchantmentObject(each.id, each.level)
                )
            )
        )
        .implement(SERVER, 'ItemEnchantableComponent', 'hasEnchantment', (call) => {
            const id = typeIdArgument(call);
            return withLinkedStack(call, (_stack, item) => (item.enchantments ?? []).some((each) => each.id === id));
        })
        .implement(SERVER, 'ItemEnchantableComponent', 'removeEnchantment', (call) => {
            const id = typeIdArgument(call);
            changeLinked(call, (item) => {
                const left = (item.enchantments ?? []).filter((each) => each.id !== id);
                return left.length === 0 ? without(item, 'enchantments') : { ...item, enchantments: left };
            });
            return undefined;
        })
        .implement(SERVER, 'ItemEnchantableComponent', 'removeAllEnchantments', (call) => {
            changeLinked(call, (item) => without(item, 'enchantments'));
            return undefined;
        });
};

const implementPotion = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const { world } = host;
    const potionOf = (call: ScriptCall, member: string) =>
        withLinkedStack(call, (_stack, item) => {
            const found = world.catalog?.potionOf(item.typeId, item.data ?? 0);
            if (found === undefined) throw plainError(`Failed to get property '${member}'.`);
            return found;
        });
    implementations
        .implement(SERVER, 'ItemPotionComponent', 'potionEffectType', {
            get: (call) =>
                host.instance(
                    'PotionEffectType',
                    BLOCK_ITEM_TAG.potionEffectType,
                    potionOf(call, 'potionEffectType').effect
                )
        })
        .implement(SERVER, 'ItemPotionComponent', 'potionDeliveryType', {
            get: (call) =>
                host.instance(
                    'PotionDeliveryType',
                    BLOCK_ITEM_TAG.potionDeliveryType,
                    potionOf(call, 'potionDeliveryType').delivery
                )
        });
};

/** A written book's item, which `signBook` turns a writable book into. */
const WRITTEN_BOOK = 'minecraft:written_book';

const implementBook = (
    implementations: ScriptApiImplementations,
    host: PackHost,
    changeLinked: (call: ScriptCall, edit: (item: ScriptItem) => ScriptItem) => void
): void => {
    const pagesOf = (call: ScriptCall): readonly ScriptBookPage[] =>
        withLinkedStack(call, (_stack, item) => item.book?.pages ?? []);
    const textOf = (page: ScriptBookPage | undefined): string | undefined =>
        page !== undefined && 'text' in page ? page.text : undefined;
    const rawOf = (page: ScriptBookPage | undefined): string | undefined =>
        page !== undefined && 'raw' in page ? page.raw : undefined;
    /** A page as a script wrote it: plain text, or a `RawMessage` kept as its JSON. */
    const pageArgument = (call: ScriptCall, value: ScriptValue | undefined): ScriptBookPage => {
        if (typeof value === 'string') return { text: value };
        return { raw: call.stringify(value ?? null) ?? '{}' };
    };
    const setPages = (call: ScriptCall, edit: (pages: ScriptBookPage[]) => ScriptBookPage[]): void =>
        changeLinked(call, (item) => ({ ...item, book: { ...item.book, pages: edit([...(item.book?.pages ?? [])]) } }));
    const index = (call: ScriptCall): number => (typeof call.args[0] === 'number' ? Math.trunc(call.args[0]) : -1);
    implementations
        .implement(SERVER, 'ItemBookComponent', 'pageCount', { get: (call) => pagesOf(call).length })
        .implement(SERVER, 'ItemBookComponent', 'contents', {
            get: (call) => JSON.stringify(pagesOf(call).map((page) => textOf(page) ?? null))
        })
        .implement(SERVER, 'ItemBookComponent', 'rawContents', {
            get: (call) =>
                `[${pagesOf(call)
                    .map((page) => rawOf(page) ?? 'null')
                    .join(',')}]`
        })
        .implement(SERVER, 'ItemBookComponent', 'getPageContent', (call) => textOf(pagesOf(call)[index(call)]))
        .implement(SERVER, 'ItemBookComponent', 'getRawPageContent', (call) => rawOf(pagesOf(call)[index(call)]))
        .implement(SERVER, 'ItemBookComponent', 'isSigned', {
            get: (call) => withLinkedStack(call, (_stack, item) => item.typeId === WRITTEN_BOOK)
        })
        .implement(SERVER, 'ItemBookComponent', 'title', {
            get: (call) => withLinkedStack(call, (_stack, item) => item.book?.title)
        })
        .implement(SERVER, 'ItemBookComponent', 'author', {
            get: (call) => withLinkedStack(call, (_stack, item) => item.book?.author)
        })
        .implement(SERVER, 'ItemBookComponent', 'setContents', (call) => {
            const list = call.args[0];
            const pages: ScriptBookPage[] = [];
            const length = list instanceof ScriptHandle ? call.engine.get(list, 'length') : 0;
            for (let at = 0; list instanceof ScriptHandle && at < Number(length); at++) {
                const each = call.engine.get(list, String(at));
                try {
                    pages.push(pageArgument(call, each));
                } finally {
                    if (each instanceof ScriptHandle) call.engine.free(each);
                }
            }
            setPages(call, () => pages);
            return undefined;
        })
        .implement(SERVER, 'ItemBookComponent', 'setPageContent', (call) => {
            const at = index(call);
            const page = pageArgument(call, call.args[1]);
            setPages(call, (pages) => {
                // A page past the end adds empty pages up to it.
                while (pages.length < at) pages.push({ text: '' });
                pages[at] = page;
                return pages;
            });
            return undefined;
        })
        .implement(SERVER, 'ItemBookComponent', 'insertPage', (call) => {
            const at = index(call);
            const page = pageArgument(call, call.args[1]);
            setPages(call, (pages) => {
                if (at >= 0 && at <= pages.length) pages.splice(at, 0, page);
                return pages;
            });
            return undefined;
        })
        .implement(SERVER, 'ItemBookComponent', 'removePage', (call) => {
            const at = index(call);
            setPages(call, (pages) => {
                if (at >= 0 && at < pages.length) pages.splice(at, 1);
                return pages;
            });
            return undefined;
        })
        .implement(SERVER, 'ItemBookComponent', 'signBook', (call) => {
            const [title, author] = call.args;
            changeLinked(call, (item) => ({
                ...item,
                typeId: WRITTEN_BOOK,
                book: { pages: item.book?.pages ?? [], title: String(title), author: String(author) }
            }));
            return undefined;
        });
};

/**
 * The bytes BDS counts for the properties a stack gives its block, which it counts unlike an
 * entity's: 28 for each property whatever its id, and a string's UTF-8 bytes and 9 more on top, as
 * the five counts the `item-members` scenario recorded fit.
 */
const blockPropertiesByteCount = (properties: ReadonlyMap<string, ScriptPropertyValue> | undefined): number => {
    let total = 0;
    for (const value of properties?.values() ?? []) {
        total += 28 + (typeof value === 'string' ? Buffer.byteLength(value, 'utf8') + 9 : 0);
    }
    return total;
};

const implementBlockProperties = (
    implementations: ScriptApiImplementations,
    changeLinked: (call: ScriptCall, edit: (item: ScriptItem) => ScriptItem) => void
): void => {
    implementations
        .implement(SERVER, 'ItemBlockDynamicPropertiesComponent', 'get', (call) =>
            withLinkedStack(call, (_stack, item) =>
                scriptValueOf(call, item.blockProperties?.get(String(call.args[0])))
            )
        )
        .implement(
            SERVER,
            'ItemBlockDynamicPropertiesComponent',
            'set',
            (call) => {
                const id = String(call.args[0]);
                const value: ScriptPropertyValue | undefined = propertyValueOf(call, id, call.args[1]);
                changeLinked(call, (item) => {
                    const properties = new Map(item.blockProperties);
                    if (value === undefined) properties.delete(id);
                    else properties.set(id, value);
                    return properties.size === 0
                        ? without(item, 'blockProperties')
                        : { ...item, blockProperties: properties };
                });
                return undefined;
            },
            CONVERTS_VALUE
        )
        .implement(SERVER, 'ItemBlockDynamicPropertiesComponent', 'totalByteCount', (call) =>
            withLinkedStack(call, (_stack, item) => blockPropertiesByteCount(item.blockProperties))
        );
};
