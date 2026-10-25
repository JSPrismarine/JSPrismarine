import { predicateAt } from './conditions';
import type { PredicateContext } from './context';
import type { ItemStack } from './item';
import { asBoolean, asList, asNumber, asString, isJsonObject, member, namespaced } from './json';
import { rootContext } from './parse';
import type { ParseContext, ParseOptions, ParseResult } from './parse';
import { floatProviderAt, intProviderAt, isEntityTarget, targetEntity } from './providers';
import type { EntityTarget } from './providers';
import { parseComposed, resolveMembers } from './reference';
import { itemPredicate } from './subpredicates';

/**
 * A compiled item modifier, which Java also stores on its own as an
 * `item_modifier` file. Returning undefined means the modifier discarded the
 * stack.
 */
export type ItemModifier = (stack: ItemStack, context: PredicateContext) => ItemStack | undefined;

/** The 42 loot function types Java 26.3 registers in `LootItemFunctions`. */
export const LOOT_FUNCTION_TYPES = [
    'set_count',
    'set_item',
    'enchant_with_levels',
    'enchant_randomly',
    'set_enchantments',
    'set_custom_data',
    'set_components',
    'furnace_smelt',
    'enchanted_count_increase',
    'set_damage',
    'set_attributes',
    'set_name',
    'exploration_map',
    'set_stew_effect',
    'copy_name',
    'set_contents',
    'modify_contents',
    'filtered',
    'limit_count',
    'apply_bonus',
    'set_loot_table',
    'explosion_decay',
    'set_lore',
    'fill_player_head',
    'copy_custom_data',
    'copy_state',
    'set_banner_pattern',
    'set_potion',
    'set_random_dyes',
    'set_random_potion',
    'set_instrument',
    'sequence',
    'copy_components',
    'set_fireworks',
    'set_firework_explosion',
    'set_book_cover',
    'set_written_book_pages',
    'set_writable_book_pages',
    'toggle_tooltips',
    'set_ominous_bottle_amplifier',
    'set_custom_model_data',
    'discard'
] as const;

/** One of {@link LOOT_FUNCTION_TYPES}. */
export type LootFunctionType = (typeof LOOT_FUNCTION_TYPES)[number];

const keep: ItemModifier = (stack) => stack;

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

const requireHost = <T>(value: T | undefined, context: PredicateContext, path: string, what: string): T | undefined => {
    if (value === undefined) context.diagnostics.warn(path, `${what} is not available on this host`);
    return value;
};

const componentOf = (stack: ItemStack, type: string): Record<string, unknown> => {
    const held = stack.components.get(type);
    return typeof held === 'object' && held !== null && !Array.isArray(held) ? { ...held } : {};
};

/**
 * Compiles Java's `ListOperation`, whose `MapCodec` dispatches on a `mode` key
 * that sits flat beside the rest of the owner's members, so `value` is the
 * owning object rather than the mode alone.
 */
const listOperation = (
    value: unknown,
    context: ParseContext
): ((current: readonly unknown[], additions: readonly unknown[]) => unknown[]) => {
    const mode = asString(member(value, 'mode')) ?? 'replace_all';
    const offset = Math.max(0, asNumber(member(value, 'offset')) ?? 0);
    const size = Math.max(0, asNumber(member(value, 'size')) ?? 0);

    if (mode === 'replace_all') return (_current, additions) => [...additions];
    if (mode === 'append') return (current, additions) => [...current, ...additions];
    if (mode === 'insert')
        return (current, additions) => [...current.slice(0, offset), ...additions, ...current.slice(offset)];
    if (mode === 'replace_section') {
        return (current, additions) => [...current.slice(0, offset), ...additions, ...current.slice(offset + size)];
    }

    context.at('mode').error(`unknown list operation mode ${mode}`);
    return (current) => [...current];
};

const listComponent = (stack: ItemStack, type: string): readonly unknown[] => {
    const held = stack.components.get(type);
    return Array.isArray(held) ? held : [];
};

const parseTarget = (value: unknown, context: ParseContext, fallback: string): EntityTarget | undefined => {
    const target = asString(value) ?? fallback;
    if (!isEntityTarget(target)) {
        context.error(`unknown entity target ${target}`);
        return undefined;
    }
    return target;
};

const enchantmentLevels = (stack: ItemStack, type: string): Record<string, number> => {
    const held = componentOf(stack, type);
    const nested = held['levels'];
    const source = typeof nested === 'object' && nested !== null ? { ...nested } : held;
    return Object.fromEntries(
        Object.entries(source).flatMap(([id, level]) =>
            typeof level === 'number' ? [[namespaced(id), level] as const] : []
        )
    );
};

const bonusFormula = (
    value: unknown,
    context: ParseContext
): ((count: number, level: number, evaluation: PredicateContext) => number) => {
    const formula = namespaced(asString(member(value, 'formula')) ?? '').slice('minecraft:'.length);
    const parameters = member(value, 'parameters');

    if (formula === 'ore_drops') {
        return (count, level, evaluation) => {
            if (level <= 0) return count;
            const bonus = evaluation.random.nextInt(level + 2) - 1;
            return count * Math.max(1, bonus + 1);
        };
    }
    if (formula === 'uniform_bonus_count') {
        const multiplier = asNumber(member(parameters, 'bonusMultiplier')) ?? 1;
        return (count, level, evaluation) => count + evaluation.random.nextInt(multiplier * level + 1);
    }
    if (formula === 'binomial_with_bonus_count') {
        const extra = asNumber(member(parameters, 'extra')) ?? 0;
        const probability = asNumber(member(parameters, 'probability')) ?? 0;
        return (count, level, evaluation) => {
            let bonus = 0;
            for (let trial = 0; trial < level + extra; trial += 1) {
                if (evaluation.random.nextFloat() < probability) bonus += 1;
            }
            return count + bonus;
        };
    }

    context.at('formula').error(`unknown apply_bonus formula ${formula}`);
    return (count) => count;
};

type ModifierParser = (value: unknown, context: ParseContext) => ItemModifier;

const textComponents = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : [value]);

const MODIFIERS: Readonly<Record<LootFunctionType, ModifierParser>> = {
    set_count: (value, context) => {
        const count = intProviderAt(member(value, 'count'), context.at('count'));
        const add = asBoolean(member(value, 'add')) ?? false;
        return (stack, evaluation) => {
            const next = (add ? stack.count : 0) + count(evaluation);
            return evaluation.items.withCount(stack, clamp(next, 0, evaluation.items.maxStackSize(stack)));
        };
    },
    set_item: (value, context) => {
        const id = asString(member(value, 'item'));
        if (id === undefined) context.at('item').error('set_item needs an item id');
        return (stack, evaluation) => (id === undefined ? stack : evaluation.items.withId(stack, namespaced(id)));
    },
    enchant_with_levels: (value, context) => {
        const levels = intProviderAt(member(value, 'levels'), context.at('levels'));
        const options =
            member(value, 'options') === undefined
                ? undefined
                : [...resolveMembers(member(value, 'options'), 'enchantment', context.at('options')).ids];
        const path = context.path;
        return (stack, evaluation) => {
            const select = requireHost(
                evaluation.enchantments.selectRandomEnchantments,
                evaluation,
                path,
                'enchant_with_levels'
            );
            const drawn = select?.(stack, levels(evaluation), options);
            if (!drawn) return stack;
            return evaluation.items.withComponent(stack, 'minecraft:enchantments', {
                levels: Object.fromEntries(drawn)
            });
        };
    },
    enchant_randomly: (value, context) => {
        const options =
            member(value, 'options') === undefined
                ? undefined
                : [...resolveMembers(member(value, 'options'), 'enchantment', context.at('options')).ids];
        const path = context.path;
        return (stack, evaluation) => {
            const choices = options ?? evaluation.enchantments.applicableTo?.(stack);
            if (!choices || choices.length === 0) {
                evaluation.diagnostics.warn(path, 'enchant_randomly has no enchantment to choose from');
                return stack;
            }
            const chosen = choices[evaluation.random.nextInt(choices.length)]!;
            const max = evaluation.enchantments.maxLevel?.(chosen) ?? 1;
            const level = 1 + evaluation.random.nextInt(Math.max(1, max));
            const levels = enchantmentLevels(stack, 'minecraft:enchantments');
            levels[chosen] = level;
            return evaluation.items.withComponent(stack, 'minecraft:enchantments', { levels });
        };
    },
    set_enchantments: (value, context) => {
        const wanted = Object.entries(
            isJsonObject(member(value, 'enchantments')) ? (member(value, 'enchantments') ?? {}) : {}
        );
        const levels = wanted.map(
            ([id, provider]) => [namespaced(id), intProviderAt(provider, context.at('enchantments').at(id))] as const
        );
        const add = asBoolean(member(value, 'add')) ?? false;
        return (stack, evaluation) => {
            const current = enchantmentLevels(stack, 'minecraft:enchantments');
            for (const [id, provider] of levels) {
                current[id] = (add ? (current[id] ?? 0) : 0) + provider(evaluation);
            }
            return evaluation.items.withComponent(stack, 'minecraft:enchantments', { levels: current });
        };
    },
    set_custom_data: (value) => {
        const tag = member(value, 'tag');
        return (stack, evaluation) => evaluation.items.withComponent(stack, 'minecraft:custom_data', tag);
    },
    set_components: (value, context) => {
        const components = isJsonObject(member(value, 'components')) ? member(value, 'components') : undefined;
        if (components === undefined) context.at('components').error('set_components needs a component map');
        const entries = Object.entries(isJsonObject(components) ? components : {});
        return (stack, evaluation) =>
            entries.reduce(
                (carry, [type, json]) => evaluation.items.withComponent(carry, namespaced(type), json),
                stack
            );
    },
    furnace_smelt: (value, context) => {
        const useInputCount = asBoolean(member(value, 'use_input_count')) ?? false;
        const path = context.path;
        return (stack, evaluation) => {
            const smelt = requireHost(evaluation.content.smeltingResult, evaluation, path, 'furnace_smelt');
            const smelted = smelt?.(stack);
            if (!smelted) return stack;
            const count = (useInputCount ? stack.count : 1) * smelted.count;
            return evaluation.items.withCount(smelted, Math.min(count, evaluation.items.maxStackSize(smelted)));
        };
    },
    enchanted_count_increase: (value, context) => {
        const enchantment = namespaced(asString(member(value, 'enchantment')) ?? '');
        const count = intProviderAt(member(value, 'count'), context.at('count'));
        const limit = asNumber(member(value, 'limit'));
        const path = context.path;
        return (stack, evaluation) => {
            const attacker = evaluation.parameter('attacking_entity', path);
            const weapon = attacker?.equipment?.mainhand;
            const level = weapon ? (evaluation.enchantments.levelOn?.(weapon, enchantment) ?? 0) : 0;
            if (level === 0) return stack;
            const raised = stack.count + count(evaluation) * level;
            return evaluation.items.withCount(stack, limit === undefined ? raised : Math.min(limit, raised));
        };
    },
    set_damage: (value, context) => {
        const damage = floatProviderAt(member(value, 'damage'), context.at('damage'));
        const add = asBoolean(member(value, 'add')) ?? false;
        const path = context.path;
        return (stack, evaluation) => {
            const max = evaluation.items.maxDamage(stack);
            if (max <= 0) {
                evaluation.diagnostics.warn(path, `set_damage reached ${stack.id}, which takes no damage`);
                return stack;
            }
            const held = stack.components.get('minecraft:damage');
            const current = typeof held === 'number' ? held : 0;
            const remaining = (add ? 1 - current / max : 0) + damage(evaluation);
            return evaluation.items.withComponent(
                stack,
                'minecraft:damage',
                Math.floor(clamp(1 - remaining, 0, 1) * max)
            );
        };
    },
    set_attributes: (value, context) => {
        const replace = asBoolean(member(value, 'replace')) ?? true;
        const modifiers = asList(member(value, 'modifiers')).map((entry, index) => {
            const at = context.at('modifiers').at(index);
            return {
                id: asString(member(entry, 'id')) ?? '',
                attribute: namespaced(asString(member(entry, 'attribute')) ?? ''),
                operation: asString(member(entry, 'operation')) ?? 'add_value',
                slot: member(entry, 'slot'),
                amount: floatProviderAt(member(entry, 'amount'), at.at('amount'))
            };
        });
        return (stack, evaluation) => {
            const rolled = modifiers.map((modifier) => ({
                id: modifier.id,
                type: modifier.attribute,
                operation: modifier.operation,
                slot: modifier.slot,
                amount: modifier.amount(evaluation)
            }));
            const current = replace ? [] : listComponent(stack, 'minecraft:attribute_modifiers');
            return evaluation.items.withComponent(stack, 'minecraft:attribute_modifiers', [...current, ...rolled]);
        };
    },
    set_name: (value, context) => {
        const name = member(value, 'name');
        const target = asString(member(value, 'target')) ?? 'custom_name';
        if (target !== 'custom_name' && target !== 'item_name') {
            context.at('target').error(`unknown set_name target ${target}`);
        }
        const component = target === 'item_name' ? 'minecraft:item_name' : 'minecraft:custom_name';
        return (stack, evaluation) => evaluation.items.withComponent(stack, component, name);
    },
    exploration_map: (value, context) => {
        const request = {
            destination: asString(member(value, 'destination')) ?? '#minecraft:on_treasure_maps',
            decoration: namespaced(asString(member(value, 'decoration')) ?? 'mansion'),
            zoom: asNumber(member(value, 'zoom')) ?? 2,
            searchRadius: asNumber(member(value, 'search_radius')) ?? 50,
            skipExistingChunks: asBoolean(member(value, 'skip_existing_chunks')) ?? true
        };
        const path = context.path;
        return (stack, evaluation) => {
            const build = requireHost(evaluation.content.explorationMap, evaluation, path, 'exploration_map');
            return build?.(stack, request) ?? stack;
        };
    },
    set_stew_effect: (value, context) => {
        const effects = asList(member(value, 'effects')).map((entry, index) => {
            const at = context.at('effects').at(index);
            return {
                id: namespaced(asString(member(entry, 'type')) ?? asString(member(entry, 'id')) ?? ''),
                duration: intProviderAt(member(entry, 'duration'), at.at('duration'))
            };
        });
        return (stack, evaluation) => {
            if (effects.length === 0) return stack;
            const chosen = effects[evaluation.random.nextInt(effects.length)]!;
            return evaluation.items.withComponent(stack, 'minecraft:suspicious_stew_effects', [
                { id: chosen.id, duration: chosen.duration(evaluation) }
            ]);
        };
    },
    copy_name: (value, context) => {
        const source = asString(member(value, 'source')) ?? 'this';
        const path = context.path;
        const target = source === 'block_entity' ? undefined : parseTarget(source, context.at('source'), 'this');
        return (stack, evaluation) => {
            if (source === 'block_entity') {
                const blockEntity = evaluation.parameter('block_entity', path);
                const name = blockEntity?.components?.get('minecraft:custom_name');
                return name === undefined
                    ? stack
                    : evaluation.items.withComponent(stack, 'minecraft:custom_name', name);
            }
            if (!target) return stack;
            const name = targetEntity(evaluation, target, path)?.components?.get('minecraft:custom_name');
            return name === undefined ? stack : evaluation.items.withComponent(stack, 'minecraft:custom_name', name);
        };
    },
    set_contents: (value, context) => {
        const component = namespaced(asString(member(value, 'component')) ?? 'container');
        const entries = member(value, 'entries');
        const path = context.path;
        return (stack, evaluation) => {
            const roll = requireHost(evaluation.content.rollEntries, evaluation, path, 'set_contents');
            const contents = roll?.(entries);
            return contents === undefined ? stack : evaluation.items.withComponent(stack, component, contents);
        };
    },
    modify_contents: (value, context) => {
        const component = namespaced(asString(member(value, 'component')) ?? 'container');
        const inner = modifierAt(member(value, 'modifier'), context.at('modifier'));
        return (stack, evaluation) => {
            const current = listComponent(stack, component);
            const modified = current.flatMap((entry) => {
                if (!isJsonObject(entry)) return [entry];
                const id = asString(entry['id']);
                if (id === undefined) return [entry];
                const nested: ItemStack = {
                    id: namespaced(id),
                    count: asNumber(entry['count']) ?? 1,
                    components: new Map(Object.entries(isJsonObject(entry['components']) ? entry['components'] : {}))
                };
                const result = inner(nested, evaluation);
                return result === undefined
                    ? []
                    : [{ id: result.id, count: result.count, components: Object.fromEntries(result.components) }];
            });
            return evaluation.items.withComponent(stack, component, modified);
        };
    },
    filtered: (value, context) => {
        const filter = itemPredicate(member(value, 'item_filter'), context.at('item_filter'));
        const onPass = modifierAt(member(value, 'on_pass'), context.at('on_pass'));
        const onFail = modifierAt(member(value, 'on_fail'), context.at('on_fail'));
        return (stack, evaluation) =>
            filter(stack, evaluation) ? onPass(stack, evaluation) : onFail(stack, evaluation);
    },
    limit_count: (value, context) => {
        const bounds = member(value, 'limit');
        const low =
            member(bounds, 'min') === undefined
                ? undefined
                : intProviderAt(member(bounds, 'min'), context.at('limit').at('min'));
        const high =
            member(bounds, 'max') === undefined
                ? undefined
                : intProviderAt(member(bounds, 'max'), context.at('limit').at('max'));
        return (stack, evaluation) => {
            let count = stack.count;
            if (low) count = Math.max(count, low(evaluation));
            if (high) count = Math.min(count, high(evaluation));
            return evaluation.items.withCount(stack, count);
        };
    },
    apply_bonus: (value, context) => {
        const enchantment = namespaced(asString(member(value, 'enchantment')) ?? '');
        const formula = bonusFormula(value, context);
        const path = context.path;
        return (stack, evaluation) => {
            const tool = evaluation.parameter('tool', path);
            const level = tool ? (evaluation.enchantments.levelOn?.(tool, enchantment) ?? 0) : 0;
            return evaluation.items.withCount(stack, formula(stack.count, level, evaluation));
        };
    },
    set_loot_table: (value, context) => {
        const id = asString(member(value, 'loot_table_id')) ?? asString(member(value, 'name'));
        if (id === undefined) context.error('set_loot_table needs a loot table id');
        const seed = asNumber(member(value, 'seed')) ?? 0;
        return (stack, evaluation) =>
            id === undefined
                ? stack
                : evaluation.items.withComponent(stack, 'minecraft:container_loot', {
                      loot_table: namespaced(id),
                      seed
                  });
    },
    explosion_decay: (_value, context) => {
        const path = context.path;
        return (stack, evaluation) => {
            const radius = evaluation.parameter('explosion_radius', path);
            if (radius === undefined) return stack;
            const chance = 1 / radius;
            let survivors = 0;
            for (let item = 0; item < stack.count; item += 1) {
                if (evaluation.random.nextFloat() <= chance) survivors += 1;
            }
            return evaluation.items.withCount(stack, survivors);
        };
    },
    set_lore: (value, context) => {
        const lore = textComponents(member(value, 'lore'));
        const operation = listOperation(value, context);
        return (stack, evaluation) =>
            evaluation.items.withComponent(
                stack,
                'minecraft:lore',
                operation(listComponent(stack, 'minecraft:lore'), lore)
            );
    },
    fill_player_head: (value, context) => {
        const target = parseTarget(member(value, 'entity'), context.at('entity'), 'this');
        const path = context.path;
        return (stack, evaluation) => {
            if (!target) return stack;
            const entity = targetEntity(evaluation, target, path);
            if (!entity) return stack;
            const profile = requireHost(evaluation.content.profileOf, evaluation, path, 'fill_player_head');
            const value_ = profile?.(entity);
            return value_ === undefined ? stack : evaluation.items.withComponent(stack, 'minecraft:profile', value_);
        };
    },
    copy_custom_data: (value, context) => {
        const source = member(value, 'source');
        const sourceKind = asString(member(source, 'type')) ?? asString(source) ?? 'context';
        const sourceTarget = asString(member(source, 'target')) ?? 'this';
        const operations = asList(member(value, 'ops')).map((entry) => ({
            from: asString(member(entry, 'source')) ?? '',
            to: asString(member(entry, 'target')) ?? '',
            op: asString(member(entry, 'op')) ?? 'replace'
        }));
        const path = context.path;

        const read = (root: unknown, pointer: string): unknown =>
            pointer
                .split('.')
                .filter((segment) => segment !== '')
                .reduce<unknown>((carry, segment) => member(carry, segment), root);

        return (stack, evaluation) => {
            if (sourceKind !== 'context') {
                evaluation.diagnostics.warn(path, `copy_custom_data cannot read from a ${sourceKind} source`);
                return stack;
            }
            const origin =
                sourceTarget === 'block_entity'
                    ? evaluation.parameter('block_entity', path)?.nbt
                    : isEntityTarget(sourceTarget)
                      ? targetEntity(evaluation, sourceTarget, path)?.nbt
                      : undefined;
            if (origin === undefined) return stack;

            const data = componentOf(stack, 'minecraft:custom_data');
            for (const operation of operations) {
                const copied = read(origin, operation.from);
                if (copied === undefined) continue;
                const existing = data[operation.to];
                data[operation.to] =
                    operation.op === 'append' && Array.isArray(existing) ? [...existing, copied] : copied;
            }
            return evaluation.items.withComponent(stack, 'minecraft:custom_data', data);
        };
    },
    copy_state: (value, context) => {
        const block = namespaced(asString(member(value, 'block')) ?? '');
        if (block === 'minecraft:') context.at('block').error('copy_state needs a block id');
        const properties = asList(member(value, 'properties')).flatMap((entry) => {
            const name = asString(entry);
            return name === undefined ? [] : [name];
        });
        const path = context.path;
        return (stack, evaluation) => {
            const state = evaluation.parameter('block_state', path);
            if (!state || namespaced(state.name) !== block) return stack;
            const copied = Object.fromEntries(
                properties.flatMap((name) => {
                    const held = state.properties?.[name];
                    return held === undefined ? [] : [[name, held] as const];
                })
            );
            return evaluation.items.withComponent(stack, 'minecraft:block_state', copied);
        };
    },
    set_banner_pattern: (value, context) => {
        const patterns = asList(member(value, 'patterns'));
        const append = asBoolean(member(value, 'append')) ?? false;
        void context;
        return (stack, evaluation) => {
            const current = append ? listComponent(stack, 'minecraft:banner_patterns') : [];
            return evaluation.items.withComponent(stack, 'minecraft:banner_patterns', [...current, ...patterns]);
        };
    },
    set_potion: (value, context) => {
        const id = asString(member(value, 'id'));
        if (id === undefined) context.at('id').error('set_potion needs a potion id');
        return (stack, evaluation) => {
            if (id === undefined) return stack;
            const contents = componentOf(stack, 'minecraft:potion_contents');
            contents['potion'] = namespaced(id);
            return evaluation.items.withComponent(stack, 'minecraft:potion_contents', contents);
        };
    },
    set_random_dyes: (value, context) => {
        const count = intProviderAt(member(value, 'number_of_dyes'), context.at('number_of_dyes'));
        const path = context.path;
        return (stack, evaluation) => {
            const palette = requireHost(evaluation.content.dyeColors, evaluation, path, 'set_random_dyes')?.();
            if (!palette || palette.length === 0) return stack;
            const draws = Math.max(0, count(evaluation));
            let red = 0;
            let green = 0;
            let blue = 0;
            for (let draw = 0; draw < draws; draw += 1) {
                const color = palette[evaluation.random.nextInt(palette.length)]!;
                red += (color >> 16) & 0xff;
                green += (color >> 8) & 0xff;
                blue += color & 0xff;
            }
            if (draws === 0) return stack;
            const mixed =
                ((Math.floor(red / draws) << 16) | (Math.floor(green / draws) << 8) | Math.floor(blue / draws)) >>> 0;
            return evaluation.items.withComponent(stack, 'minecraft:dyed_color', mixed);
        };
    },
    set_random_potion: (value, context) => {
        const options = [...resolveMembers(member(value, 'options'), 'item', context.at('options')).ids];
        return (stack, evaluation) => {
            if (options.length === 0) return stack;
            const contents = componentOf(stack, 'minecraft:potion_contents');
            contents['potion'] = options[evaluation.random.nextInt(options.length)]!;
            return evaluation.items.withComponent(stack, 'minecraft:potion_contents', contents);
        };
    },
    set_instrument: (value, context) => {
        const options = [...resolveMembers(member(value, 'options'), 'item', context.at('options')).ids];
        const tags = resolveMembers(member(value, 'options'), 'item', context.at('options')).tags;
        const path = context.path;
        return (stack, evaluation) => {
            if (options.length === 0) {
                evaluation.diagnostics.warn(
                    path,
                    `set_instrument could not expand ${tags.join(', ') || 'its options'} into instruments`
                );
                return stack;
            }
            return evaluation.items.withComponent(
                stack,
                'minecraft:instrument',
                options[evaluation.random.nextInt(options.length)]!
            );
        };
    },
    sequence: (value, context) => {
        const steps = parseComposed(
            member(value, 'functions'),
            'item_modifier',
            context.at('functions'),
            inlineModifier
        );
        return (stack, evaluation) =>
            steps.reduce<ItemStack | undefined>(
                (carry, step) => (carry === undefined ? undefined : step(carry, evaluation)),
                stack
            );
    },
    copy_components: (value, context) => {
        const source = asString(member(value, 'source')) ?? 'block_entity';
        if (source !== 'block_entity') context.at('source').error(`unknown copy_components source ${source}`);
        const include =
            member(value, 'include') === undefined
                ? undefined
                : asList(member(value, 'include')).flatMap((entry) => {
                      const id = asString(entry);
                      return id === undefined ? [] : [namespaced(id)];
                  });
        const exclude = asList(member(value, 'exclude')).flatMap((entry) => {
            const id = asString(entry);
            return id === undefined ? [] : [namespaced(id)];
        });
        const path = context.path;
        return (stack, evaluation) => {
            const blockEntity = evaluation.parameter('block_entity', path);
            const components = blockEntity?.components;
            if (!components) return stack;
            let carry = stack;
            for (const [type, held] of components) {
                if (include && !include.includes(type)) continue;
                if (exclude.includes(type)) continue;
                carry = evaluation.items.withComponent(carry, type, held);
            }
            return carry;
        };
    },
    set_fireworks: (value, context) => {
        const held = member(value, 'explosions');
        const explosions = asList(member(held, 'values'));
        const operation = listOperation(held, context.at('explosions'));
        const flight =
            member(value, 'flight_duration') === undefined
                ? undefined
                : intProviderAt(member(value, 'flight_duration'), context.at('flight_duration'));
        return (stack, evaluation) => {
            const current = componentOf(stack, 'minecraft:fireworks');
            const previous = Array.isArray(current['explosions']) ? current['explosions'] : [];
            if (held !== undefined) current['explosions'] = operation(previous, explosions);
            if (flight) current['flight_duration'] = flight(evaluation);
            return evaluation.items.withComponent(stack, 'minecraft:fireworks', current);
        };
    },
    set_firework_explosion: (value, context) => {
        void context;
        const fields = (['shape', 'colors', 'fade_colors', 'trail', 'twinkle'] as const).flatMap((field) => {
            const held = member(value, field);
            return held === undefined ? [] : [[field, held] as const];
        });
        return (stack, evaluation) => {
            const current = componentOf(stack, 'minecraft:firework_explosion');
            for (const [field, held] of fields) current[field] = held;
            return evaluation.items.withComponent(stack, 'minecraft:firework_explosion', current);
        };
    },
    set_book_cover: (value) => {
        const fields = (['title', 'author', 'generation'] as const).flatMap((field) => {
            const held = member(value, field);
            return held === undefined ? [] : [[field, held] as const];
        });
        return (stack, evaluation) => {
            const current = componentOf(stack, 'minecraft:written_book_content');
            for (const [field, held] of fields) current[field] = held;
            return evaluation.items.withComponent(stack, 'minecraft:written_book_content', current);
        };
    },
    set_written_book_pages: (value, context) => {
        const pages = asList(member(value, 'pages'));
        const operation = listOperation(value, context);
        return (stack, evaluation) => {
            const current = componentOf(stack, 'minecraft:written_book_content');
            const held = Array.isArray(current['pages']) ? current['pages'] : [];
            current['pages'] = operation(held, pages);
            return evaluation.items.withComponent(stack, 'minecraft:written_book_content', current);
        };
    },
    set_writable_book_pages: (value, context) => {
        const pages = asList(member(value, 'pages'));
        const operation = listOperation(value, context);
        return (stack, evaluation) =>
            evaluation.items.withComponent(
                stack,
                'minecraft:writable_book_content',
                operation(listComponent(stack, 'minecraft:writable_book_content'), pages)
            );
    },
    toggle_tooltips: (value, context) => {
        const toggles = Object.entries(isJsonObject(member(value, 'toggles')) ? (member(value, 'toggles') ?? {}) : {});
        if (toggles.length === 0) context.at('toggles').error('toggle_tooltips needs at least one toggle');
        return (stack, evaluation) =>
            toggles.reduce((carry, [type, shown]) => {
                const component = componentOf(carry, namespaced(type));
                component['show_in_tooltip'] = asBoolean(shown) ?? true;
                return evaluation.items.withComponent(carry, namespaced(type), component);
            }, stack);
    },
    set_ominous_bottle_amplifier: (value, context) => {
        const amplifier = intProviderAt(member(value, 'amplifier'), context.at('amplifier'));
        return (stack, evaluation) =>
            evaluation.items.withComponent(
                stack,
                'minecraft:ominous_bottle_amplifier',
                clamp(amplifier(evaluation), 0, 4)
            );
    },
    set_custom_model_data: (value, context) => {
        const fields = (['floats', 'flags', 'strings', 'colors'] as const).map((field) => {
            const held = member(value, field);
            return {
                field,
                values: asList(member(held, 'values')),
                operation: listOperation(held, context.at(field)),
                present: held !== undefined
            };
        });
        return (stack, evaluation) => {
            const current = componentOf(stack, 'minecraft:custom_model_data');
            for (const { field, values, operation, present } of fields) {
                if (!present) continue;
                const held = Array.isArray(current[field]) ? current[field] : [];
                current[field] = operation(held, values);
            }
            return evaluation.items.withComponent(stack, 'minecraft:custom_model_data', current);
        };
    },
    discard: () => () => undefined
};

const isFunctionType = (value: string): value is LootFunctionType =>
    LOOT_FUNCTION_TYPES.some((known) => known === value);

const inlineModifier = (value: unknown, context: ParseContext): ItemModifier | undefined => {
    if (!isJsonObject(value)) {
        context.error('an item modifier must be an object or a reference');
        return undefined;
    }

    const declared = asString(value['type']);
    if (declared === undefined) {
        context.error('an item modifier needs a type');
        return undefined;
    }

    const name = namespaced(declared).slice('minecraft:'.length);
    if (!isFunctionType(name)) {
        context.error(`unknown item modifier type ${declared}`);
        return undefined;
    }

    const apply = MODIFIERS[name](value, context);
    if (value['condition'] === undefined) return apply;

    const condition = predicateAt(value['condition'], context.at('condition'));
    return (stack, evaluation) => (condition(evaluation) ? apply(stack, evaluation) : stack);
};

/**
 * Parses an item modifier field under 26.3's composition rule and applies the
 * resolved modifiers in order. A field that resolves to nothing leaves the
 * stack alone.
 */
export const modifierAt = (value: unknown, context: ParseContext): ItemModifier => {
    const steps = parseComposed(value, 'item_modifier', context, inlineModifier);
    if (steps.length === 0) return keep;
    if (steps.length === 1) return steps[0]!;
    return (stack, evaluation) =>
        steps.reduce<ItemStack | undefined>(
            (carry, step) => (carry === undefined ? undefined : step(carry, evaluation)),
            stack
        );
};

/** Compiles an item modifier, an `item_modifier` file, or a loot function field from parsed JSON. */
export const parseItemModifier = (value: unknown, options?: ParseOptions): ParseResult<ItemModifier> => {
    const context = rootContext(options);
    return { value: modifierAt(value, context), diagnostics: context.diagnostics.entries };
};
