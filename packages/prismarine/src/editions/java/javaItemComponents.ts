/**
 * What a stack changes from its item's defaults, as the data components a Java slot carries: the
 * fields `Item` keeps of its own, such as its name and its damage, and the components in its bag
 * that a Java slot can carry, read from their JSON form.
 */
import type { JavaItemComponents, JavaItemStack } from '@jsprismarine/protocol/java/packet/itemStack';
import { CONFIGURATION } from '@jsprismarine/protocol/java/versions/newest';
import type { JavaText } from '@jsprismarine/protocol/java/wire/javaTypes';

import type { StackComponents } from '../../item/stackComponents';
import type { ShownStack } from '../../player/presenter/SessionPresenter';
import { isRecord } from '../../utils/isRecord';

/** The enchantments a Java client knows, which the server sends it in configuration. */
const KNOWN_ENCHANTMENTS: ReadonlySet<string> = new Set(
    CONFIGURATION.registries.find(({ registry }) => registry === 'minecraft:enchantment')?.entries ?? []
);

/** The item that keeps its enchantments to apply, rather than having them. */
const ENCHANTED_BOOK = 'minecraft:enchanted_book';

/**
 * A text component's JSON as the Java text a slot carries: plain text, or a translation with its
 * arguments. Other parts, such as a score or a selector, show as nothing, and a list joins its
 * parts' text.
 * @param value - The JSON.
 * @returns The text, or undefined when the value is no text component.
 */
export const javaComponentTextOf = (value: unknown): JavaText | undefined => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
        const parts = value.map(javaComponentTextOf);
        return parts.every((part) => typeof part === 'string') ? parts.join('') : undefined;
    }
    if (!isRecord(value)) return undefined;
    if (typeof value.translate === 'string') {
        const args = Array.isArray(value.with)
            ? value.with.map((argument: unknown) => javaComponentTextOf(argument) ?? '')
            : [];
        return args.length === 0 ? { translate: value.translate } : { translate: value.translate, with: args };
    }
    return typeof value.text === 'string' ? value.text : undefined;
};

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const numbersOf = (value: unknown): number[] => (Array.isArray(value) ? value.filter(isNumber) : []);

/**
 * `minecraft:custom_model_data` from its JSON, whose lists are each optional.
 * @javaSee CustomModelData.CODEC
 */
const customModelDataOf = (value: unknown): JavaItemComponents['minecraft:custom_model_data'] => {
    if (!isRecord(value)) return undefined;
    return {
        floats: numbersOf(value.floats),
        flags: Array.isArray(value.flags) ? value.flags.filter((flag) => typeof flag === 'boolean') : [],
        strings: Array.isArray(value.strings) ? value.strings.filter((entry) => typeof entry === 'string') : [],
        colors: numbersOf(value.colors).map((color) => Math.trunc(color))
    };
};

/**
 * `minecraft:use_cooldown` from its JSON.
 * @javaSee UseCooldown.CODEC
 */
const useCooldownOf = (value: unknown): JavaItemComponents['minecraft:use_cooldown'] => {
    if (!isRecord(value) || !isNumber(value.seconds)) return undefined;
    return typeof value.cooldown_group === 'string'
        ? { seconds: value.seconds, group: value.cooldown_group }
        : { seconds: value.seconds };
};

/**
 * `minecraft:food` from its JSON.
 * @javaSee FoodProperties.DIRECT_CODEC
 */
const foodOf = (value: unknown): JavaItemComponents['minecraft:food'] => {
    if (!isRecord(value) || !isNumber(value.nutrition) || !isNumber(value.saturation)) return undefined;
    return { nutrition: value.nutrition, saturation: value.saturation, canAlwaysEat: value.can_always_eat === true };
};

/** The components of a stack's bag that a Java slot carries, read from their JSON form. */
const bagComponentsOf = (bag: StackComponents): JavaItemComponents => {
    const maxStackSize = bag['minecraft:max_stack_size'];
    const glint = bag['minecraft:enchantment_glint_override'];
    const model = bag['minecraft:item_model'];
    const itemName = javaComponentTextOf(bag['minecraft:item_name']);
    const customModelData = customModelDataOf(bag['minecraft:custom_model_data']);
    const useCooldown = useCooldownOf(bag['minecraft:use_cooldown']);
    const food = foodOf(bag['minecraft:food']);
    return {
        ...(isNumber(maxStackSize) ? { 'minecraft:max_stack_size': maxStackSize } : {}),
        ...(bag['minecraft:unbreakable'] === undefined ? {} : { 'minecraft:unbreakable': true }),
        ...(itemName === undefined ? {} : { 'minecraft:item_name': itemName }),
        ...(typeof model === 'string' ? { 'minecraft:item_model': model } : {}),
        ...(customModelData === undefined ? {} : { 'minecraft:custom_model_data': customModelData }),
        ...(typeof glint === 'boolean' ? { 'minecraft:enchantment_glint_override': glint } : {}),
        ...(useCooldown === undefined ? {} : { 'minecraft:use_cooldown': useCooldown }),
        ...(food === undefined ? {} : { 'minecraft:food': food })
    };
};

/**
 * The components a Java slot carries for a stack. An enchantment the client does not know, such
 * as one only an addon defines, is left out, since the slot names each one by its registry entry.
 * @param stack - The stack, with its Bedrock identifier.
 * @returns The components, empty for a plain stack.
 */
export const javaItemComponentsOf = (stack: ShownStack): JavaItemComponents => {
    const enchantments = Object.fromEntries(
        [...(stack.enchantments ?? [])].filter(([name, level]) => KNOWN_ENCHANTMENTS.has(name) && level > 0)
    );
    const lore = stack.lore ?? [];
    return {
        ...bagComponentsOf(stack.components ?? {}),
        ...(stack.damage !== undefined && stack.damage > 0 ? { 'minecraft:damage': stack.damage } : {}),
        ...(stack.customName === undefined ? {} : { 'minecraft:custom_name': stack.customName }),
        ...(lore.length === 0 ? {} : { 'minecraft:lore': lore }),
        ...(Object.keys(enchantments).length === 0
            ? {}
            : stack.name === ENCHANTED_BOOK
              ? { 'minecraft:stored_enchantments': enchantments }
              : { 'minecraft:enchantments': enchantments })
    };
};

/** Java text as a stack's plain text: only plain text is, since a stack holds names as strings. */
const plainTextOf = (text: JavaText | undefined): string | undefined => (typeof text === 'string' ? text : undefined);

/**
 * The components of a Java stack that a stack's bag keeps, in Java's JSON form, which
 * {@link javaItemComponentsOf} reads back.
 */
const bagOf = (components: JavaItemComponents): Record<string, unknown> => {
    const customModelData = components['minecraft:custom_model_data'];
    const cooldown = components['minecraft:use_cooldown'];
    const food = components['minecraft:food'];
    return {
        ...(components['minecraft:max_stack_size'] === undefined
            ? {}
            : { 'minecraft:max_stack_size': components['minecraft:max_stack_size'] }),
        ...(components['minecraft:unbreakable'] === undefined ? {} : { 'minecraft:unbreakable': {} }),
        ...(components['minecraft:item_name'] === undefined
            ? {}
            : { 'minecraft:item_name': components['minecraft:item_name'] }),
        ...(components['minecraft:item_model'] === undefined
            ? {}
            : { 'minecraft:item_model': components['minecraft:item_model'] }),
        ...(customModelData === undefined ? {} : { 'minecraft:custom_model_data': { ...customModelData } }),
        ...(components['minecraft:enchantment_glint_override'] === undefined
            ? {}
            : { 'minecraft:enchantment_glint_override': components['minecraft:enchantment_glint_override'] }),
        ...(cooldown === undefined
            ? {}
            : {
                  'minecraft:use_cooldown': {
                      seconds: cooldown.seconds,
                      ...(cooldown.group === undefined ? {} : { cooldown_group: cooldown.group })
                  }
              }),
        ...(food === undefined
            ? {}
            : {
                  'minecraft:food': {
                      nutrition: food.nutrition,
                      saturation: food.saturation,
                      can_always_eat: food.canAlwaysEat
                  }
              })
    };
};

/**
 * What a Java stack changes from its item's defaults, as a stack's plain data: the inverse of
 * {@link javaItemComponentsOf}, for a stack a Java client sends. A name or lore line that is a
 * translation rather than plain text, and a component the server keeps no field or bag entry for,
 * are left out.
 * @param name - The stack's Bedrock identifier.
 * @param stack - The stack as the client sent it.
 * @returns The stack.
 */
export const shownStackOfJava = (name: string, { count, components = {} }: JavaItemStack): ShownStack => {
    const customName = plainTextOf(components['minecraft:custom_name']);
    const lore = (components['minecraft:lore'] ?? []).map(plainTextOf).filter((line) => line !== undefined);
    const damage = components['minecraft:damage'];
    const levels = components['minecraft:stored_enchantments'] ?? components['minecraft:enchantments'] ?? {};
    const enchantments = new Map(Object.entries(levels).filter(([, level]) => level > 0));
    const bag = bagOf(components);
    return {
        name,
        count,
        ...(customName === undefined ? {} : { customName }),
        ...(lore.length === 0 ? {} : { lore }),
        ...(damage === undefined || damage <= 0 ? {} : { damage }),
        ...(enchantments.size === 0 ? {} : { enchantments }),
        ...(Object.keys(bag).length === 0 ? {} : { components: bag })
    };
};
