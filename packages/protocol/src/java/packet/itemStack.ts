/**
 * Java Edition's `Slot`: an item stack on the wire, with the data component patch that sets what
 * the stack changes from its item's defaults, such as its name, its damage or its model.
 *
 * The patch names each component type by its id in `minecraft:data_component_type`, and each type
 * writes its value with a codec of its own. The components here are the ones the server sends;
 * a patch that carries any other cannot be read past, since nothing on the wire says how long a
 * value is, so reading one throws.
 */
import BinaryStream from '@jsprismarine/binaryutils';
import { ProtocolWireErrors } from '@jsprismarine/errors/protocol/wire';

import type { WireType } from '../../wire/fieldTypes';
import { bool, custom, list, optional } from '../../wire/fieldTypes';
import { CONFIGURATION, DATA_COMPONENT_TYPES } from '../versions/newest';
import type { JavaText } from '../wire/javaTypes';
import { float, int, javaString, textComponent, varInt } from '../wire/javaTypes';
import type { JavaConsumable, JavaEquippable, JavaTool } from './itemBehavior';
import { consumable, equippable, tool } from './itemBehavior';

/**
 * `minecraft:custom_model_data`: the values an item model's `custom_model_data` properties and
 * tints read, by index.
 * @javaSource CustomModelData.STREAM_CODEC
 */
export interface JavaCustomModelData {
    readonly floats: readonly number[];
    readonly flags: readonly boolean[];
    readonly strings: readonly string[];
    /** RGB colors, as `0xRRGGBB`. */
    readonly colors: readonly number[];
}

/**
 * `minecraft:use_cooldown`: how long the item cannot be used again after a use, and the group of
 * items that share the cooldown, the item's own id when absent.
 * @javaSource UseCooldown.STREAM_CODEC
 */
export interface JavaUseCooldown {
    readonly seconds: number;
    readonly group?: string;
}

/**
 * `minecraft:food`: what eating the item restores.
 * @javaSource FoodProperties.DIRECT_STREAM_CODEC
 */
export interface JavaFood {
    readonly nutrition: number;
    readonly saturation: number;
    readonly canAlwaysEat: boolean;
}

/** The components a slot can carry, by component type, with the value each one's codec writes. */
export interface JavaItemComponents {
    readonly 'minecraft:max_stack_size'?: number;
    readonly 'minecraft:max_damage'?: number;
    /** How much durability the stack has spent. */
    readonly 'minecraft:damage'?: number;
    readonly 'minecraft:unbreakable'?: true;
    /** The name an anvil or a command gave the stack, which the client shows in italics. */
    readonly 'minecraft:custom_name'?: JavaText;
    /** The item's own name, which replaces the one its type gives it. */
    readonly 'minecraft:item_name'?: JavaText;
    /** The item model the stack draws with, an `items/` definition in a resource pack. */
    readonly 'minecraft:item_model'?: string;
    readonly 'minecraft:lore'?: readonly JavaText[];
    /** Enchantment levels, by enchantment. */
    readonly 'minecraft:enchantments'?: Readonly<Record<string, number>>;
    /** An enchanted book's enchantments, which an anvil applies. */
    readonly 'minecraft:stored_enchantments'?: Readonly<Record<string, number>>;
    readonly 'minecraft:custom_model_data'?: JavaCustomModelData;
    readonly 'minecraft:enchantment_glint_override'?: boolean;
    readonly 'minecraft:use_cooldown'?: JavaUseCooldown;
    readonly 'minecraft:food'?: JavaFood;
    readonly 'minecraft:consumable'?: JavaConsumable;
    readonly 'minecraft:tool'?: JavaTool;
    readonly 'minecraft:equippable'?: JavaEquippable;
}

/** A component type this module reads and writes. */
export type JavaItemComponentType = keyof JavaItemComponents;

/** An item stack as plain data: an item's network id, how many, and what it changes from its item's defaults. */
export interface JavaItemStack {
    readonly item: number;
    readonly count: number;
    /** The components the stack sets. */
    readonly components?: JavaItemComponents;
    /** The component types the stack takes away from its item's defaults. */
    readonly removed?: readonly string[];
}

/** `Identifier`: a namespaced id as a string. */
const identifier = javaString(32_767);

/** A registry the server sent in configuration, whose entries a holder names by index. */
const configuredRegistry = (name: string): readonly string[] =>
    CONFIGURATION.registries.find(({ registry: id }) => id === name)?.entries ?? [];

const ENCHANTMENTS = configuredRegistry('minecraft:enchantment');
const ENCHANTMENT_IDS = new Map(ENCHANTMENTS.map((name, id) => [name, id]));

/**
 * `ItemEnchantments`: a VarInt count, then each enchantment's registry index and its level.
 * @javaSource ItemEnchantments.STREAM_CODEC
 */
const enchantments = custom<Readonly<Record<string, number>>>(
    'Item Enchantments',
    (s, levels) => {
        const entries = Object.entries(levels);
        varInt.write(s, entries.length);
        for (const [name, level] of entries) {
            const id = ENCHANTMENT_IDS.get(name);
            if (id === undefined)
                throw new ProtocolWireErrors.JavaRegistryEntryUnknown({
                    registry: 'minecraft:enchantment',
                    entry: name
                });
            varInt.write(s, id);
            varInt.write(s, level);
        }
    },
    (s) => {
        const levels: Record<string, number> = {};
        for (let count = varInt.read(s); count > 0; count--) {
            const id = varInt.read(s);
            const name = ENCHANTMENTS[id];
            if (name === undefined)
                throw new ProtocolWireErrors.JavaRegistryEntryUnknown({
                    registry: 'minecraft:enchantment',
                    entry: `#${id}`
                });
            levels[name] = varInt.read(s);
        }
        return levels;
    }
);

const floatList = list(float);
const boolList = list(bool);
const stringList = list(javaString(32_767));
const intList = list(int);

const customModelData = custom<JavaCustomModelData>(
    'Custom Model Data',
    (s, { floats, flags, strings, colors }) => {
        floatList.write(s, [...floats]);
        boolList.write(s, [...flags]);
        stringList.write(s, [...strings]);
        intList.write(s, [...colors]);
    },
    (s) => ({
        floats: floatList.read(s),
        flags: boolList.read(s),
        strings: stringList.read(s),
        colors: intList.read(s)
    })
);

const optionalIdentifier = optional(identifier);

const useCooldown = custom<JavaUseCooldown>(
    'Use Cooldown',
    (s, { seconds, group }) => {
        float.write(s, seconds);
        optionalIdentifier.write(s, group ?? null);
    },
    (s) => {
        const seconds = float.read(s);
        const group = optionalIdentifier.read(s);
        return group === null ? { seconds } : { seconds, group };
    }
);

const food = custom<JavaFood>(
    'Food Properties',
    (s, { nutrition, saturation, canAlwaysEat }) => {
        varInt.write(s, nutrition);
        float.write(s, saturation);
        bool.write(s, canAlwaysEat);
    },
    (s) => ({ nutrition: varInt.read(s), saturation: float.read(s), canAlwaysEat: bool.read(s) })
);

/** `Unit`: a component that is there or not, and writes nothing. */
const unit = custom<true>(
    'Unit',
    () => {},
    () => true
);

/** `ItemLore`: at most 256 lines. */
const lore = list(textComponent);

/** Each component type's value, when the stack sets it. */
type ComponentValues = { readonly [K in JavaItemComponentType]-?: NonNullable<JavaItemComponents[K]> };

/** Each component type's codec, as `DataComponents` registers it. */
const CODECS: { readonly [K in JavaItemComponentType]: WireType<ComponentValues[K]> } = {
    'minecraft:max_stack_size': varInt,
    'minecraft:max_damage': varInt,
    'minecraft:damage': varInt,
    'minecraft:unbreakable': unit,
    'minecraft:custom_name': textComponent,
    'minecraft:item_name': textComponent,
    'minecraft:item_model': identifier,
    'minecraft:lore': custom<readonly JavaText[]>(
        lore.wire,
        (s, lines) => lore.write(s, [...lines]),
        (s) => lore.read(s)
    ),
    'minecraft:enchantments': enchantments,
    'minecraft:stored_enchantments': enchantments,
    'minecraft:custom_model_data': customModelData,
    'minecraft:enchantment_glint_override': bool,
    'minecraft:use_cooldown': useCooldown,
    'minecraft:food': food,
    'minecraft:consumable': consumable,
    'minecraft:tool': tool,
    'minecraft:equippable': equippable
};

const isComponentType = (name: string): name is JavaItemComponentType => Object.hasOwn(CODECS, name);

/** A component type's network id. */
const componentId = (name: string): number => {
    const id = DATA_COMPONENT_TYPES.idOf(name);
    if (id === undefined)
        throw new ProtocolWireErrors.JavaRegistryEntryUnknown({
            registry: 'minecraft:data_component_type',
            entry: name
        });
    return id;
};

/** The component type a network id names, when this module reads it. */
const componentType = (id: number): JavaItemComponentType => {
    const name = DATA_COMPONENT_TYPES.nameOf(id) ?? `#${id}`;
    if (!isComponentType(name)) throw new ProtocolWireErrors.JavaItemComponentUnread({ component: name });
    return name;
};

/** One component's value through its type's codec. */
const writeValue = <K extends JavaItemComponentType>(s: BinaryStream, type: K, value: ComponentValues[K]): void => {
    const codec: WireType<ComponentValues[K]> = CODECS[type];
    codec.write(s, value);
};

/** One component of a stack, which sets it. */
const writeComponent = (s: BinaryStream, type: JavaItemComponentType, components: JavaItemComponents): void => {
    const value = components[type];
    if (value !== undefined) writeValue(s, type, value);
};

/** The components a stack sets, in a fixed order, so the same stack writes the same bytes. */
const setComponents = (components: JavaItemComponents | undefined): JavaItemComponentType[] =>
    components === undefined
        ? []
        : Object.keys(CODECS).filter(
              (type): type is JavaItemComponentType => isComponentType(type) && components[type] !== undefined
          );

/** A patch read so far: the components set, and the types removed. */
const stackOf = (
    item: number,
    count: number,
    components: JavaItemComponents,
    removed: readonly string[]
): JavaItemStack => ({
    item,
    count,
    ...(Object.keys(components).length > 0 ? { components } : {}),
    ...(removed.length > 0 ? { removed } : {})
});

/**
 * Writes a stack with its patch, through `value` for each component's value: the plain value for
 * the server's codec, or one with its length in front for a client's.
 */
const writeStack = (
    s: BinaryStream,
    stack: JavaItemStack | null,
    value: (s: BinaryStream, type: JavaItemComponentType, components: JavaItemComponents) => void
): void => {
    if (stack === null || stack.count <= 0) {
        varInt.write(s, 0);
        return;
    }
    varInt.write(s, stack.count);
    varInt.write(s, stack.item);
    const set = setComponents(stack.components);
    const removed = stack.removed ?? [];
    varInt.write(s, set.length);
    varInt.write(s, removed.length);
    for (const type of set) {
        varInt.write(s, componentId(type));
        value(s, type, stack.components ?? {});
    }
    for (const type of removed) varInt.write(s, componentId(type));
};

/** Reads a stack, through `value` for each component's value. */
const readStack = (
    s: BinaryStream,
    value: (s: BinaryStream, id: number, components: Record<string, unknown>) => void
): JavaItemStack | null => {
    const count = varInt.read(s);
    if (count <= 0) return null;
    const item = varInt.read(s);
    const added = varInt.read(s);
    const removedCount = varInt.read(s);
    const components: Record<string, unknown> = {};
    for (let i = 0; i < added; i++) value(s, varInt.read(s), components);
    const removed: string[] = [];
    for (let i = 0; i < removedCount; i++) {
        const id = varInt.read(s);
        removed.push(DATA_COMPONENT_TYPES.nameOf(id) ?? `#${id}`);
    }
    // Each value was read through its own type's codec, so the record holds each type's value.
    return stackOf(item, count, components as JavaItemComponents, removed);
};

/**
 * `Slot` as the server writes it: a count, zero for an empty slot, then the item's id and its
 * data component patch, each set component's id followed by its value.
 * @javaSource ItemStack.OPTIONAL_STREAM_CODEC
 */
export const itemStack: WireType<JavaItemStack | null> = custom<JavaItemStack | null>(
    'Slot',
    (s, stack) => writeStack(s, stack, writeComponent),
    (s) =>
        readStack(s, (input, id, components) => {
            const type = componentType(id);
            components[type] = CODECS[type].read(input);
        })
);

/**
 * `Slot` as a client writes it, vanilla's untrusted codec: each set component's value carries its
 * byte length, so a component this module does not read is skipped.
 * @javaSource ItemStack.OPTIONAL_UNTRUSTED_STREAM_CODEC
 */
export const untrustedItemStack: WireType<JavaItemStack | null> = custom<JavaItemStack | null>(
    'Untrusted Slot',
    (s, stack) =>
        writeStack(s, stack, (out, type, components) => {
            // Some values, such as a unit's, write nothing, and an empty stream has no buffer to return.
            const value = new BinaryStream(undefined, 0, 16);
            writeComponent(value, type, components);
            const bytes = value.getWriteBuffer();
            varInt.write(out, bytes.byteLength);
            out.write(bytes);
        }),
    (s) =>
        readStack(s, (input, id, components) => {
            const bytes = input.read(varInt.read(input));
            const name = DATA_COMPONENT_TYPES.nameOf(id);
            if (name !== undefined && isComponentType(name))
                components[name] = CODECS[name].read(new BinaryStream(bytes));
        })
);
