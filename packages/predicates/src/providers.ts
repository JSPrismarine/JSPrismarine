import { predicateAt } from './conditions';
import type { LootContextParameter, PredicateContext } from './context';
import { asList, asNumber, asString, isJsonObject, member, namespaced } from './json';
import { rootContext } from './parse';
import type { ParseContext, ParseOptions, ParseResult } from './parse';
import { parseComposed, parseComposedOne } from './reference';
import type { ElementRegistry } from './reference';
import type { EntityView } from './world';

/** A number provider compiled once and drawn from a context. */
export type NumberProvider = (context: PredicateContext) => number;

/** An enchantment level based value, which maps an enchantment level to a number. */
export type LevelBasedValue = (level: number) => number;

/** Which of Java's two provider registries a value is parsed against. */
export type ProviderKind = 'int' | 'float';

const REGISTRY = { int: 'context_int_provider', float: 'context_float_provider' } as const satisfies Record<
    ProviderKind,
    ElementRegistry
>;

/** The six entity targets a loot context can name, mapped to the parameter each reads. */
export const ENTITY_TARGETS = {
    this: 'this_entity',
    attacker: 'attacking_entity',
    direct_attacker: 'direct_attacking_entity',
    attacking_player: 'last_damage_player',
    target_entity: 'target_entity',
    interacting_entity: 'interacting_entity'
} as const satisfies Record<string, LootContextParameter>;

/** One of the keys of {@link ENTITY_TARGETS}. */
export type EntityTarget = keyof typeof ENTITY_TARGETS;

/** Whether a string names one of {@link ENTITY_TARGETS}. */
export const isEntityTarget = (value: string): value is EntityTarget => value in ENTITY_TARGETS;

/** Reads the entity a loot context target names, reporting through the context when it cannot. */
export const targetEntity = (context: PredicateContext, target: EntityTarget, path: string): EntityView | undefined =>
    context.parameter(ENTITY_TARGETS[target], path);

const truncate = (value: number): number => Math.trunc(value);

/**
 * Rounds a drawn value the way Java's registry would: an int provider
 * truncates toward zero, and a float provider is a 32-bit `float`, so a
 * `set_damage` of 0.9 floors to the same durability Java produces.
 */
const forKind = (kind: ProviderKind, value: number): number => (kind === 'int' ? truncate(value) : Math.fround(value));

const constant =
    (value: number): NumberProvider =>
    () =>
        value;

type Parser = (value: unknown, kind: ProviderKind, context: ParseContext) => NumberProvider;

const providerAt: Parser = (value, kind, context) =>
    parseComposedOne(value, REGISTRY[kind], context, (inline, inner) => inlineProvider(inline, kind, inner)) ??
    constant(0);

const operand = (value: unknown, key: string, kind: ProviderKind, context: ParseContext): NumberProvider =>
    providerAt(member(value, key), kind, context.at(key));

const operands = (value: unknown, key: string, kind: ProviderKind, context: ParseContext): NumberProvider[] => {
    const parsed = parseComposed(member(value, key), REGISTRY[kind], context.at(key), (inline, inner) =>
        inlineProvider(inline, kind, inner)
    );
    if (parsed.length === 0) context.at(key).error('expected at least one provider');
    return parsed;
};

const aggregate =
    (key: string, fold: (values: number[], kind: ProviderKind) => number): Parser =>
    (value, kind, context) => {
        const inputs = operands(value, key, kind, context);
        return (evaluation) =>
            forKind(
                kind,
                fold(
                    inputs.map((input) => input(evaluation)),
                    kind
                )
            );
    };

const binary =
    (apply: (left: number, right: number, kind: ProviderKind) => number): Parser =>
    (value, kind, context) => {
        const left = operand(value, 'left', kind, context);
        const right = operand(value, 'right', kind, context);
        return (evaluation) => forKind(kind, apply(left(evaluation), right(evaluation), kind));
    };

const unary =
    (apply: (input: number) => number): Parser =>
    (value, kind, context) => {
        const input = operand(value, 'input', kind, context);
        return (evaluation) => forKind(kind, apply(input(evaluation)));
    };

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

const parseStorageAccess = (
    value: unknown,
    context: ParseContext
): { readonly storage: string; readonly path: string } => {
    const storage = asString(member(value, 'storage'));
    const path = asString(member(value, 'path'));
    if (storage === undefined || path === undefined) context.error('a storage access needs a storage and a path');
    return { storage: storage ?? '', path: path ?? '' };
};

const parseScoreTarget = (
    value: unknown,
    context: ParseContext
): ((evaluation: PredicateContext, path: string) => string | undefined) => {
    const type = asString(member(value, 'type'));
    const name = type === undefined ? undefined : namespaced(type).slice('minecraft:'.length);
    if (name === 'fixed') {
        const fixed = asString(member(value, 'name')) ?? '';
        return () => fixed;
    }
    if (name === 'context') {
        const target = asString(member(value, 'target')) ?? 'this';
        if (!isEntityTarget(target)) {
            context.error(`unknown entity target ${target}`);
            return () => undefined;
        }
        return (evaluation, path) => targetEntity(evaluation, target, path)?.type;
    }

    context.error(`unknown scoreboard name provider type ${type ?? '<missing>'}`);
    return () => undefined;
};

const SHARED: Readonly<Record<string, Parser>> = {
    constant: (value, kind, context) => {
        const literal = asNumber(member(value, 'value'));
        if (literal === undefined) context.at('value').error('a constant provider needs a numeric value');
        return constant(forKind(kind, literal ?? 0));
    },
    abs: unary(Math.abs),
    negate: unary((input) => -input),
    add: aggregate('inputs', sum),
    mul: aggregate('inputs', (values) => values.reduce((total, value) => total * value, 1)),
    max: aggregate('inputs', (values) => Math.max(...values)),
    min: aggregate('inputs', (values) => Math.min(...values)),
    avg: aggregate('inputs', (values, kind) => {
        const mean = values.length === 0 ? 0 : sum(values) / values.length;
        return kind === 'int' ? truncate(mean) : mean;
    }),
    sub: binary((left, right) => left - right),
    div: binary((left, right, kind) => (right === 0 ? 0 : kind === 'int' ? truncate(left / right) : left / right)),
    mod: binary((left, right) => (right === 0 ? 0 : left % right)),
    pow: (value, kind, context) => {
        const base = operand(value, 'base', kind, context);
        const exponent = operand(value, 'exponent', kind, context);
        return (evaluation) => forKind(kind, base(evaluation) ** exponent(evaluation));
    },
    uniform: (value, kind, context) => {
        const low = operand(value, 'min', kind, context);
        const high = operand(value, 'max', kind, context);
        return (evaluation) => {
            const min = low(evaluation);
            const max = high(evaluation);
            if (max < min) return min;
            return kind === 'int'
                ? min + evaluation.random.nextInt(truncate(max) - truncate(min) + 1)
                : min + evaluation.random.nextFloat() * (max - min);
        };
    },
    conditional: (value, kind, context) => {
        const condition = predicateAt(member(value, 'condition'), context.at('condition'));
        const onTrue = operand(value, 'on_true', kind, context);
        const onFalse = operand(value, 'on_false', kind, context);
        return (evaluation) => (condition(evaluation) ? onTrue(evaluation) : onFalse(evaluation));
    },
    number_dispatcher: (value, kind, context) => {
        const branches = asList(member(value, 'cases')).map((entry, index) => {
            const at = context.at('cases').at(index);
            return {
                condition: predicateAt(member(entry, 'condition'), at.at('condition')),
                value: operand(entry, 'value', kind, at)
            };
        });
        const fallback = operand(value, 'default', kind, context);
        return (evaluation) => {
            const match = branches.find((branch) => branch.condition(evaluation));
            return (match?.value ?? fallback)(evaluation);
        };
    },
    weighted_list: (value, kind, context) => {
        const list = asList(member(value, 'distribution')).map((entry, index) => {
            const at = context.at('distribution').at(index);
            return {
                data: providerAt(member(entry, 'data'), kind, at.at('data')),
                weight: Math.max(0, asNumber(member(entry, 'weight')) ?? 1)
            };
        });
        if (list.length === 0) context.at('distribution').error('a weighted list needs at least one entry');
        const total = list.reduce((carry, entry) => carry + entry.weight, 0);
        return (evaluation) => {
            if (list.length === 0 || total <= 0) return 0;
            let roll = evaluation.random.nextFloat() * total;
            for (const entry of list) {
                roll -= entry.weight;
                if (roll < 0) return entry.data(evaluation);
            }
            return list[list.length - 1]!.data(evaluation);
        };
    },
    storage: (value, kind, context) => {
        const access = parseStorageAccess(value, context);
        const fallback = operand(value, 'fallback', kind, context);
        return (evaluation) => {
            const level = evaluation.levelWith('storedNumber', `${context.path}.storage`);
            const stored = level?.storedNumber(access.storage, access.path);
            return stored === undefined ? fallback(evaluation) : forKind(kind, stored);
        };
    },
    environment_attribute: (value, kind, context) => {
        const attribute = namespaced(asString(member(value, 'attribute')) ?? '');
        if (attribute === 'minecraft:') context.at('attribute').error('an environment attribute needs a name');
        return (evaluation) => {
            const level = evaluation.levelWith('environmentAttribute', `${context.path}.attribute`);
            const origin = evaluation.parameters.origin;
            return forKind(kind, level?.environmentAttribute(attribute, origin) ?? 0);
        };
    }
};

const INT_ONLY: Readonly<Record<string, Parser>> = {
    binomial: (value, _kind, context) => {
        const trials = operand(value, 'n', 'int', context);
        const probability = operand(value, 'p', 'float', context);
        return (evaluation) => {
            const n = trials(evaluation);
            const p = probability(evaluation);
            let successes = 0;
            for (let draw = 0; draw < n; draw += 1) {
                if (evaluation.random.nextFloat() < p) successes += 1;
            }
            return successes;
        };
    },
    floor_div: binary((left, right) => (right === 0 ? 0 : Math.floor(left / right))),
    floor_mod: binary((left, right) => (right === 0 ? 0 : ((left % right) + right) % right)),
    from_float: (value, _kind, context) => {
        const input = providerAt(member(value, 'input'), 'float', context.at('input'));
        return (evaluation) => truncate(input(evaluation));
    },
    score: (value, _kind, context) => {
        const target = parseScoreTarget(member(value, 'target'), context.at('target'));
        const objective = asString(member(value, 'score')) ?? '';
        if (objective === '') context.at('score').error('a score provider needs an objective name');
        const fallback = operand(value, 'fallback', 'int', context);
        return (evaluation) => {
            const holder = target(evaluation, `${context.path}.target`);
            if (holder === undefined) return fallback(evaluation);
            const level = evaluation.levelWith('score', `${context.path}.score`);
            const score = level?.score(holder, objective);
            return score === undefined ? fallback(evaluation) : truncate(score);
        };
    }
};

const FLOAT_ONLY: Readonly<Record<string, Parser>> = {
    ceil: unary(Math.ceil),
    floor: unary(Math.floor),
    round: unary((input) => Math.floor(input + 0.5)),
    truncate: unary(truncate),
    sqrt: unary((input) => Math.sqrt(Math.max(0, input))),
    sin: unary(Math.sin),
    cos: unary(Math.cos),
    length: aggregate('inputs', (values) => Math.sqrt(sum(values.map((value) => value * value)))),
    from_int: (value, _kind, context) => {
        const input = providerAt(member(value, 'input'), 'int', context.at('input'));
        return (evaluation) => input(evaluation);
    },
    enchantment_level: (value, _kind, context) => {
        const amount = levelBasedValueAt(member(value, 'amount'), context.at('amount'));
        return (evaluation) => amount(evaluation.parameter('enchantment_level', context.path) ?? 0);
    }
};

const inlineProvider = (value: unknown, kind: ProviderKind, context: ParseContext): NumberProvider | undefined => {
    const literal = asNumber(value);
    if (literal !== undefined) return constant(forKind(kind, literal));

    if (!isJsonObject(value)) {
        context.error(`expected a ${kind} provider, a number or a reference`);
        return undefined;
    }

    const declared = asString(value['type']);
    if (declared === undefined) {
        context.error('a provider object needs a type');
        return undefined;
    }

    const name = namespaced(declared).slice('minecraft:'.length);
    const parser = SHARED[name] ?? (kind === 'int' ? INT_ONLY[name] : FLOAT_ONLY[name]);
    if (!parser) {
        context.error(`unknown ${kind} provider type ${declared}`);
        return undefined;
    }
    return parser(value, kind, context);
};

/** Parses a value that may be a number, a reference, or an inline int provider object. */
export const intProviderAt = (value: unknown, context: ParseContext): NumberProvider =>
    providerAt(value, 'int', context);

/** Parses a value that may be a number, a reference, or an inline float provider object. */
export const floatProviderAt = (value: unknown, context: ParseContext): NumberProvider =>
    providerAt(value, 'float', context);

const LEVEL_BASED: Readonly<Record<string, (value: unknown, context: ParseContext) => LevelBasedValue>> = {
    constant: (value) => {
        const literal = asNumber(member(value, 'value')) ?? 0;
        return () => literal;
    },
    linear: (value) => {
        const base = asNumber(member(value, 'base')) ?? 0;
        const perLevel = asNumber(member(value, 'per_level_above_first')) ?? 0;
        return (level) => base + perLevel * (level - 1);
    },
    clamped: (value, context) => {
        const inner = levelBasedValueAt(member(value, 'value'), context.at('value'));
        const min = asNumber(member(value, 'min')) ?? Number.NEGATIVE_INFINITY;
        const max = asNumber(member(value, 'max')) ?? Number.POSITIVE_INFINITY;
        return (level) => Math.min(max, Math.max(min, inner(level)));
    },
    fraction: (value, context) => {
        const numerator = levelBasedValueAt(member(value, 'numerator'), context.at('numerator'));
        const denominator = levelBasedValueAt(member(value, 'denominator'), context.at('denominator'));
        return (level) => {
            const divisor = denominator(level);
            return divisor === 0 ? 0 : numerator(level) / divisor;
        };
    },
    levels_squared: (value) => {
        const added = asNumber(member(value, 'added')) ?? 0;
        return (level) => level * level + added;
    },
    exponent: (value, context) => {
        const base = levelBasedValueAt(member(value, 'base'), context.at('base'));
        const power = levelBasedValueAt(member(value, 'power'), context.at('power'));
        return (level) => base(level) ** power(level);
    },
    lookup: (value, context) => {
        const values = asList(member(value, 'values')).map((entry) => asNumber(entry) ?? 0);
        const fallback = levelBasedValueAt(member(value, 'fallback'), context.at('fallback'));
        return (level) => values[level - 1] ?? fallback(level);
    }
};

/** Parses an enchantment level based value, which may be a bare number or a typed object. */
export const levelBasedValueAt = (value: unknown, context: ParseContext): LevelBasedValue => {
    const literal = asNumber(value);
    if (literal !== undefined) return () => literal;

    const declared = asString(member(value, 'type'));
    if (declared === undefined) {
        context.error('a level based value needs a number or a type');
        return () => 0;
    }

    const parser = LEVEL_BASED[namespaced(declared).slice('minecraft:'.length)];
    if (!parser) {
        context.error(`unknown level based value type ${declared}`);
        return () => 0;
    }
    return parser(value, context);
};

/** Compiles an int provider from parsed JSON. */
export const parseIntProvider = (value: unknown, options?: ParseOptions): ParseResult<NumberProvider> => {
    const context = rootContext(options);
    return { value: intProviderAt(value, context), diagnostics: context.diagnostics.entries };
};

/** Compiles a float provider from parsed JSON. */
export const parseFloatProvider = (value: unknown, options?: ParseOptions): ParseResult<NumberProvider> => {
    const context = rootContext(options);
    return { value: floatProviderAt(value, context), diagnostics: context.diagnostics.entries };
};

/** Compiles an enchantment level based value from parsed JSON. */
export const parseLevelBasedValue = (value: unknown, options?: ParseOptions): ParseResult<LevelBasedValue> => {
    const context = rootContext(options);
    return { value: levelBasedValueAt(value, context), diagnostics: context.diagnostics.entries };
};
