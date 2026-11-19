/**
 * The `@minecraft/server` entity components beyond the inventory, and the slots of containers:
 * `EntityEquippableComponent`, the attribute components such as `EntityHealthComponent`,
 * `Container.getSlot` and `ContainerSlot`.
 *
 * A component object carries its entity's key and, for an attribute, the attribute's id. A
 * `ContainerSlot` carries the container its slot is in, a container's state or an entity's
 * equipment, and the slot, so it reads the slot as it is now each time, as BDS's does. The values
 * and errors follow the `entity-components` scenario recorded on the pinned Bedrock Dedicated
 * Server.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { ScriptApiError } from '../errors';
import { SCRIPT_MODULE_HISTORIES } from '../generated/scriptModules';
import { isRecord } from '../isRecord';
import type { ScriptApiImplementations, ScriptCall } from '../shape/implementations';
import { ScriptHandle } from '../values';
import type { PackHost } from './minecraftServer';
import type { EntityKey } from './serverObjects';
import {
    blockKeyOf,
    COMMON,
    entityKeyOf,
    itemOf,
    itemState,
    namesBlock,
    plainError,
    SERVER,
    TAG,
    withNamespace
} from './serverObjects';
import { areaComponent, namesEnderChest } from './entities/components';
import type { ScriptAttribute, ScriptEquipmentSlot, ScriptItem, ScriptWorld } from './world';

/** The slots of the container an object's state names: an entity's inventory or a block's container. */
export const containerSlots = (world: ScriptWorld, state: string): readonly (ScriptItem | null)[] | undefined => {
    if (namesEnderChest(state)) return world.entitySystems?.enderChest(entityKeyOf(state).id);
    if (!namesBlock(state)) return world.inventory(entityKeyOf(state).id);
    const block = blockKeyOf(state);
    return world.blockInventory?.(block.dimension, block);
};

/** Writes one slot of the container an object's state names. */
export const writeContainerSlot = (
    world: ScriptWorld,
    state: string,
    slot: number,
    item: ScriptItem | undefined
): void => {
    if (namesEnderChest(state)) world.entitySystems?.setEnderChestItem(entityKeyOf(state).id, slot, item);
    else if (!namesBlock(state)) world.setInventoryItem(entityKeyOf(state).id, slot, item);
    else {
        const block = blockKeyOf(state);
        world.setBlockInventoryItem?.(block.dimension, block, slot, item);
    }
};

/** BDS's error for a slot index past a container's end, which `getItem` and `getSlot` share. */
export const slotPastEnd = (index: number, size: number): ScriptApiError =>
    plainError(`Invalid container slot provided '${index}'. Maximum slot is '${size - 1}'.`);

/**
 * The classes of the attribute components, by component id, as the shape gives each class
 * whose base is `EntityAttributeComponent` a `componentId` constant.
 */
const ATTRIBUTE_COMPONENTS: ReadonlyMap<string, string> = (() => {
    const found = new Map<string, string>();
    for (const [name, history] of Object.entries(SCRIPT_MODULE_HISTORIES[SERVER]?.declarations ?? {})) {
        const extendsAttribute = history.segments.some(
            (segment) => segment.kind === 'class' && segment.base === 'EntityAttributeComponent'
        );
        const id = history.members?.componentId?.find((member) => member.kind === 'constant');
        if (extendsAttribute && id?.kind === 'constant' && typeof id.value === 'string') found.set(id.value, name);
    }
    return found;
})();

/** What an attribute component object carries: its entity and the attribute's id. */
interface AttributeKey extends EntityKey {
    readonly attribute: string;
}

const attributeKeyOf = (state: string): AttributeKey => {
    // The host wrote the state with JSON.stringify.
    const parsed: unknown = JSON.parse(state);
    const { id, typeId } = entityKeyOf(state);
    if (!isRecord(parsed) || typeof parsed.attribute !== 'string')
        throw new ScriptHostErrors.ObjectCarriesNoState({ what: 'attribute component' });
    return { id, typeId, attribute: parsed.attribute };
};

/** Where a `ContainerSlot` is: a slot of a container, or one of an entity's equipment slots. */
type SlotKey =
    | { readonly container: string; readonly slot: number }
    | { readonly entity: EntityKey; readonly equipment: ScriptEquipmentSlot };

const EQUIPMENT_SLOTS: readonly ScriptEquipmentSlot[] = [
    'Body',
    'Chest',
    'Feet',
    'Head',
    'Legs',
    'Mainhand',
    'Offhand'
];

const isEquipmentSlot = (value: unknown): value is ScriptEquipmentSlot =>
    EQUIPMENT_SLOTS.some((slot) => slot === value);

const slotKeyOf = (state: string): SlotKey => {
    // The host wrote the state with JSON.stringify.
    const parsed: unknown = JSON.parse(state);
    if (isRecord(parsed) && typeof parsed.container === 'string' && typeof parsed.slot === 'number') {
        return { container: parsed.container, slot: parsed.slot };
    }
    if (isRecord(parsed) && typeof parsed.entity === 'string' && isEquipmentSlot(parsed.equipment)) {
        return { entity: entityKeyOf(parsed.entity), equipment: parsed.equipment };
    }
    throw new ScriptHostErrors.ObjectCarriesNoState({ what: 'container slot' });
};

/** BDS's error for a member of a slot that holds nothing or whose container is gone. */
const invalidSlot = (): ScriptApiError =>
    new ScriptApiError(
        SERVER,
        'InvalidContainerSlotError',
        'The container slot is either empty or is no longer loaded.'
    );

/**
 * The component an entity has under an id, as `Entity.getComponent` returns it, or undefined
 * when the host has no behavior for it or the entity lacks it.
 * @param id - The component id as the script wrote it, with or without its namespace.
 */
export const entityComponent = (host: PackHost, key: EntityKey, id: string): ScriptHandle | undefined => {
    const { world } = host;
    const component = withNamespace(id);
    const state = JSON.stringify(key);
    if (component === 'minecraft:inventory') {
        if (world.entity(key.id)?.inventorySize === undefined) return undefined;
        return host.engine.release(host.create('EntityInventoryComponent', TAG.inventory, state));
    }
    if (component === 'minecraft:equippable') {
        if (world.equipment?.(key.id) === undefined) return undefined;
        return host.engine.release(host.create('EntityEquippableComponent', TAG.equippable, state));
    }
    const attributeClass = ATTRIBUTE_COMPONENTS.get(component);
    if (attributeClass === undefined) return areaComponent(host, key, component);
    if (world.attribute?.(key.id, component) === undefined) return undefined;
    return host.engine.release(
        host.create(attributeClass, TAG.attribute, JSON.stringify({ ...key, attribute: component }))
    );
};

/** The id a component object of the host's reads as its `typeId`, and whether it is still valid. */
export const componentFacts = (
    world: ScriptWorld,
    tag: number,
    state: string
): { readonly typeId: string; readonly isValid: boolean } | undefined => {
    if (tag === TAG.equippable) {
        return { typeId: 'minecraft:equippable', isValid: world.equipment?.(entityKeyOf(state).id) !== undefined };
    }
    if (tag === TAG.attribute) {
        const key = attributeKeyOf(state);
        return { typeId: key.attribute, isValid: world.attribute?.(key.id, key.attribute) !== undefined };
    }
    return undefined;
};

/**
 * Registers the equippable and attribute components and the container slots.
 * @param implementations - The pack's implementations, which this adds to.
 * @param host - The pack's view of the runtime and the world.
 */
export const implementComponents = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const { world } = host;
    const slotArgument = (call: ScriptCall): ScriptEquipmentSlot => {
        const [slot] = call.args;
        // The binding checked the argument against the enum.
        if (!isEquipmentSlot(slot))
            throw new ScriptHostErrors.ArgumentNotOfType({ argument: 'slot', type: 'EquipmentSlot' });
        return slot;
    };
    /** The entity's equipment, or BDS's error for a component whose entity is gone. */
    const equipmentOf = (call: ScriptCall, member: string, access: 'get' | 'call' = 'call') => {
        const equipment = world.equipment?.(entityKeyOf(call.state).id);
        if (equipment === undefined) {
            throw plainError(`Failed to ${access === 'get' ? 'get property' : 'call function'} '${member}'.`);
        }
        return equipment;
    };
    const stackObject = (item: ScriptItem | null | undefined): ScriptHandle | undefined =>
        item === undefined || item === null
            ? undefined
            : host.engine.release(host.create('ItemStack', TAG.itemStack, itemState(item)));
    const slotObject = (key: SlotKey): ScriptHandle =>
        host.engine.release(
            host.create(
                'ContainerSlot',
                TAG.containerSlot,
                JSON.stringify(
                    'container' in key ? key : { entity: JSON.stringify(key.entity), equipment: key.equipment }
                )
            )
        );

    /** The attribute an attribute component names, or BDS's error once its entity is gone. */
    const attributeOf = (call: ScriptCall, member: string, access: 'get' | 'call' = 'get') => {
        const key = attributeKeyOf(call.state);
        const found = world.attribute?.(key.id, key.attribute);
        if (found === undefined) {
            throw plainError(`Failed to ${access === 'get' ? 'get property' : 'call function'} '${member}'.`);
        }
        return { key, attribute: found };
    };
    const setAttribute = (call: ScriptCall, member: string, value: (attribute: ScriptAttribute) => number) => {
        const { key, attribute } = attributeOf(call, member, 'call');
        world.setAttribute?.(key.id, key.attribute, value(attribute));
    };

    /** What a slot holds now: its stack, null when it is empty, or undefined when its container is gone. */
    const slotItem = (key: SlotKey): ScriptItem | null | undefined => {
        if ('container' in key) {
            const slots = containerSlots(world, key.container);
            return slots === undefined ? undefined : (slots[key.slot] ?? null);
        }
        const equipment = world.equipment?.(key.entity.id);
        return equipment === undefined ? undefined : (equipment.slots[key.equipment] ?? null);
    };
    const writeSlot = (key: SlotKey, item: ScriptItem | undefined): boolean => {
        if ('container' in key) {
            writeContainerSlot(world, key.container, key.slot, item);
            return true;
        }
        return world.setEquipment?.(key.entity.id, key.equipment, item) ?? false;
    };
    /** The stack a slot holds, or BDS's error for an empty slot or one whose container is gone. */
    const held = (call: ScriptCall): { readonly key: SlotKey; readonly item: ScriptItem } => {
        const key = slotKeyOf(call.state);
        const item = slotItem(key);
        if (item === undefined || item === null) throw invalidSlot();
        return { key, item };
    };
    /** Changes the stack a slot holds in place. */
    const change = (call: ScriptCall, edit: (item: ScriptItem) => ScriptItem): void => {
        const { key, item } = held(call);
        writeSlot(key, edit(item));
    };

    implementations
        .implement(SERVER, 'Entity', 'hasComponent', (call) => {
            const key = entityKeyOf(call.state);
            const component = entityComponent(host, key, String(call.args[0]));
            if (component === undefined) return false;
            call.engine.free(component);
            return true;
        })
        .implement(SERVER, 'EntityEquippableComponent', 'getEquipment', (call) =>
            stackObject(equipmentOf(call, 'getEquipment').slots[slotArgument(call)])
        )
        .implement(SERVER, 'EntityEquippableComponent', 'setEquipment', (call) => {
            const { id } = entityKeyOf(call.state);
            equipmentOf(call, 'setEquipment');
            const slot = slotArgument(call);
            const stack = call.args[1];
            return (
                world.setEquipment?.(
                    id,
                    slot,
                    stack instanceof ScriptHandle ? itemOf(call.stateOf(stack)) : undefined
                ) ?? false
            );
        })
        .implement(SERVER, 'EntityEquippableComponent', 'getEquipmentSlot', (call) => {
            equipmentOf(call, 'getEquipmentSlot');
            return slotObject({ entity: entityKeyOf(call.state), equipment: slotArgument(call) });
        })
        .implement(SERVER, 'EntityEquippableComponent', 'totalArmor', {
            get: (call) => equipmentOf(call, 'totalArmor', 'get').armor
        })
        .implement(SERVER, 'EntityEquippableComponent', 'totalToughness', {
            get: (call) => equipmentOf(call, 'totalToughness', 'get').toughness
        })
        .implement(SERVER, 'EntityAttributeComponent', 'currentValue', {
            get: (call) => attributeOf(call, 'currentValue').attribute.current
        })
        .implement(SERVER, 'EntityAttributeComponent', 'defaultValue', {
            get: (call) => attributeOf(call, 'defaultValue').attribute.default
        })
        .implement(SERVER, 'EntityAttributeComponent', 'effectiveMin', {
            get: (call) => attributeOf(call, 'effectiveMin').attribute.min
        })
        .implement(SERVER, 'EntityAttributeComponent', 'effectiveMax', {
            get: (call) => attributeOf(call, 'effectiveMax').attribute.max
        })
        .implement(SERVER, 'EntityAttributeComponent', 'setCurrentValue', (call) => {
            const [value] = call.args;
            const number = typeof value === 'number' ? value : 0;
            setAttribute(call, 'setCurrentValue', ({ min, max }) => {
                if (number < min || number > max) {
                    throw new ScriptApiError(
                        COMMON,
                        'ArgumentOutOfBoundsError',
                        `Unsupported or out of bounds value passed to function argument [0]: value, Value: ${number}, ` +
                            `Argument bounds: [${min}, ${max}]`,
                        { index: 0, value: number, minValue: min, maxValue: max }
                    );
                }
                return number;
            });
            return true;
        })
        .implement(SERVER, 'EntityAttributeComponent', 'resetToDefaultValue', (call) => {
            setAttribute(call, 'resetToDefaultValue', (attribute) => attribute.default);
            return undefined;
        })
        .implement(SERVER, 'EntityAttributeComponent', 'resetToMaxValue', (call) => {
            setAttribute(call, 'resetToMaxValue', (attribute) => attribute.max);
            return undefined;
        })
        .implement(SERVER, 'EntityAttributeComponent', 'resetToMinValue', (call) => {
            setAttribute(call, 'resetToMinValue', (attribute) => attribute.min);
            return undefined;
        })
        .implement(SERVER, 'Container', 'getSlot', (call) => {
            const slots = containerSlots(world, call.state);
            if (slots === undefined) throw plainError("Failed to call function 'getSlot'.");
            const [slot] = call.args;
            const index = typeof slot === 'number' ? Math.trunc(slot) : -1;
            if (index >= slots.length) throw slotPastEnd(index, slots.length);
            return slotObject({ container: call.state, slot: index });
        })
        .implement(SERVER, 'ContainerSlot', 'isValid', {
            get: (call) => slotItem(slotKeyOf(call.state)) !== undefined
        })
        .implement(SERVER, 'ContainerSlot', 'hasItem', (call) => {
            const item = slotItem(slotKeyOf(call.state));
            if (item === undefined) throw invalidSlot();
            return item !== null;
        })
        .implement(SERVER, 'ContainerSlot', 'getItem', (call) => {
            const item = slotItem(slotKeyOf(call.state));
            if (item === undefined) throw invalidSlot();
            return stackObject(item);
        })
        .implement(SERVER, 'ContainerSlot', 'setItem', (call) => {
            const key = slotKeyOf(call.state);
            if (slotItem(key) === undefined) throw invalidSlot();
            const stack = call.args[0];
            writeSlot(key, stack instanceof ScriptHandle ? itemOf(call.stateOf(stack)) : undefined);
            return undefined;
        })
        .implement(SERVER, 'ContainerSlot', 'typeId', { get: (call) => held(call).item.typeId })
        .implement(SERVER, 'ContainerSlot', 'type', {
            get: (call) => host.engine.release(host.create('ItemType', TAG.itemType, held(call).item.typeId))
        })
        .implement(SERVER, 'ContainerSlot', 'amount', {
            get: (call) => held(call).item.amount,
            set: (call) => {
                const [amount] = call.args;
                change(call, (item) => {
                    const most = world.itemType(item.typeId)?.maxStackSize ?? Number.POSITIVE_INFINITY;
                    // A slot set past its type's size holds a full stack, as an item stack does.
                    return { ...item, amount: Math.min(typeof amount === 'number' ? Math.trunc(amount) : 1, most) };
                });
            }
        })
        .implement(SERVER, 'ContainerSlot', 'maxAmount', {
            get: (call) => {
                const { item } = held(call);
                return world.itemType(item.typeId)?.maxStackSize ?? item.amount;
            }
        })
        .implement(SERVER, 'ContainerSlot', 'isStackable', {
            get: (call) => {
                const { item } = held(call);
                return (world.itemType(item.typeId)?.maxStackSize ?? 1) > 1;
            }
        })
        .implement(SERVER, 'ContainerSlot', 'nameTag', {
            get: (call) => held(call).item.nameTag,
            set: (call) => {
                const [nameTag] = call.args;
                change(call, ({ nameTag: _previous, ...item }) =>
                    typeof nameTag === 'string' ? { ...item, nameTag } : item
                );
            }
        })
        .implement(SERVER, 'ContainerSlot', 'getLore', (call) => JSON.stringify(held(call).item.lore ?? []))
        .implement(SERVER, 'ContainerSlot', 'setLore', (call) => {
            const json = call.args[0] === undefined ? undefined : call.stringify(call.args[0]);
            // The engine wrote the string with JSON.stringify, and the binding checked it is a string array.
            const lore: unknown = json === undefined ? [] : JSON.parse(json);
            const lines = Array.isArray(lore) ? lore.filter((line) => typeof line === 'string') : [];
            change(call, ({ lore: _previous, ...item }) => (lines.length === 0 ? item : { ...item, lore: lines }));
            return undefined;
        });
};
