/**
 * Brigadier argument types that also say what they are on the Bedrock wire.
 *
 * The flattener has to turn a Java-shaped tree into Bedrock overloads, and
 * Brigadier's `ArgumentType<T>` is opaque, so an argument type here answers
 * one extra question: which of the 26 Bedrock parameter types, enums or soft
 * enums expresses it. Answering `undefined` is the honest answer for the Java
 * parsers Bedrock has no type for, and the flattener turns that into a string
 * parameter plus a report entry rather than dropping the node.
 */
import type { ArgumentType, StringReader } from '@jsprismarine/brigadier';
import { CommandSyntaxException } from '@jsprismarine/brigadier';

import { bedrockCommandEnum } from './bedrockTable';
import type { BedrockParameterShape, BedrockParameterTypeName } from './parameterTypes';
import type { SelectorDialect, SelectorModel } from './selector';
import { parseSelector } from './selector';

/** An argument type that can describe itself to a Bedrock client. */
export interface BedrockDescribedType<T> extends ArgumentType<T> {
    /**
     * The wire shape of this argument.
     *
     * @returns The shape, or undefined when none of Bedrock's 26 parameter
     *   types expresses it.
     */
    describeBedrock(): BedrockParameterShape | undefined;
    /** Why Bedrock cannot express it, set exactly when `describeBedrock` answers undefined. */
    readonly bedrockGap?: string;
}

/**
 * Whether an argument type can describe itself to a Bedrock client.
 *
 * An argument type from outside this package cannot, which is the case the
 * flattener reports.
 */
export const describesBedrock = (type: unknown): type is BedrockDescribedType<unknown> =>
    typeof type === 'object' &&
    type !== null &&
    'describeBedrock' in type &&
    typeof type.describeBedrock === 'function';

// The annotation is on the constant, not just the arrow, so TypeScript treats
// a call as unreachable-after and narrows the value that preceded it.
const fail: (reader: StringReader, message: string) => never = (reader, message) => {
    throw CommandSyntaxException.BUILT_IN_EXCEPTIONS.dispatcherParseException().createWithContext(reader, message);
};

const basic = <T>(type: BedrockParameterTypeName, parse: (reader: StringReader) => T): BedrockDescribedType<T> => ({
    parse: (reader) => parse(reader),
    describeBedrock: () => ({ kind: 'basic', type })
});

// ---------------------------------------------------------------------------
// Value models
// ---------------------------------------------------------------------------

/** How a coordinate is measured. `~` is relative, `^` is local to the facing direction. */
export type CoordinateMode = 'absolute' | 'relative' | 'local';

/** One coordinate of a position argument. */
export interface Coordinate {
    readonly value: number;
    readonly mode: CoordinateMode;
}

/** The three coordinates of a `block_pos`, `vec3` or `rotation` argument. */
export type CoordinateTriple = readonly [Coordinate, Coordinate, Coordinate];

/** An inclusive integer range, as `minecraft:int_range` and `FULLINTEGERRANGE` spell it. */
export interface IntegerRange {
    readonly min?: number;
    readonly max?: number;
}

/** The scoreboard operations `/scoreboard players operation` accepts. */
export const SCOREBOARD_OPERATIONS = ['=', '+=', '-=', '*=', '/=', '%=', '<', '>', '><'] as const;

/** One scoreboard operation. */
export type ScoreboardOperation = (typeof SCOREBOARD_OPERATIONS)[number];

/** The comparisons `execute if score` accepts. */
export const COMPARE_OPERATORS = ['<', '<=', '=', '>=', '>'] as const;

/** One score comparison. */
export type CompareOperator = (typeof COMPARE_OPERATORS)[number];

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

/**
 * Reads up to the next space, or a quoted run.
 *
 * The port's `readString` stops at any character outside its unquoted set,
 * which excludes `:`, so it cuts `minecraft:stone` in half. Minecraft's own
 * arguments are whitespace-delimited, so that is the rule here.
 */
const readToken = (reader: StringReader): string => {
    if (reader.canRead() && (reader.peek() === '"' || reader.peek() === "'")) return reader.readQuotedString();
    const start = reader.getCursor();
    while (reader.canRead() && reader.peek() !== ' ') reader.skip();
    return reader.getString().slice(start, reader.getCursor());
};

const readCoordinate = (reader: StringReader): Coordinate => {
    const token = readToken(reader);
    if (token.length === 0) fail(reader, 'Expected a coordinate');
    const prefix = token[0];
    if (prefix === '~' || prefix === '^') {
        const rest = token.slice(1);
        const value = rest.length === 0 ? 0 : Number(rest);
        if (!Number.isFinite(value)) fail(reader, `'${token}' is not a coordinate`);
        return { value, mode: prefix === '~' ? 'relative' : 'local' };
    }
    const value = Number(token);
    if (!Number.isFinite(value)) fail(reader, `'${token}' is not a coordinate`);
    return { value, mode: 'absolute' };
};

const readTriple = (reader: StringReader): CoordinateTriple => {
    const x = readCoordinate(reader);
    reader.skipWhitespace();
    const y = readCoordinate(reader);
    reader.skipWhitespace();
    const z = readCoordinate(reader);
    return [x, y, z];
};

// ---------------------------------------------------------------------------
// Basic parameter types
// ---------------------------------------------------------------------------

/**
 * A target selector.
 *
 * @param options - `wildcard` picks `WILDCARDSELECTION`, the type Bedrock uses
 *   where `*` is allowed; `dialect` picks the grammar the string is read in.
 */
export const entityArgument = (
    options: { wildcard?: boolean; dialect?: SelectorDialect } = {}
): BedrockDescribedType<SelectorModel> => ({
    parse: (reader) => {
        const start = reader.getCursor();
        const token = readToken(reader);
        if (token.length === 0) fail(reader, 'Expected a target selector');
        reader.setCursor(start);
        const { selector } = parseSelector(token, options.dialect ?? 'java');
        reader.setCursor(start + token.length);
        return selector;
    },
    describeBedrock: () => ({ kind: 'basic', type: options.wildcard === true ? 'WILDCARDSELECTION' : 'SELECTION' })
});

/** A block position, three integer-or-relative coordinates. */
export const blockPositionArgument = (): BedrockDescribedType<CoordinateTriple> => basic('POSITION', readTriple);

/** A float position, three decimal-or-relative coordinates. */
export const positionArgument = (): BedrockDescribedType<CoordinateTriple> => basic('POSITION_FLOAT', readTriple);

/** One signed decimal that may be written relative, the `RVAL` type. */
export const relativeValueArgument = (): BedrockDescribedType<Coordinate> => basic('RVAL', readCoordinate);

/** A decimal, the `VAL` type. */
export const floatArgument = (bounds: { min?: number; max?: number } = {}): BedrockDescribedType<number> =>
    basic('VAL', (reader) => {
        const value = reader.readFloat();
        if (bounds.min !== undefined && value < bounds.min) fail(reader, `${value} is below ${bounds.min}`);
        if (bounds.max !== undefined && value > bounds.max) fail(reader, `${value} is above ${bounds.max}`);
        return value;
    });

/** An integer, the `INT` type. */
export const integerArgument = (bounds: { min?: number; max?: number } = {}): BedrockDescribedType<number> =>
    basic('INT', (reader) => {
        const value = reader.readInt();
        if (bounds.min !== undefined && value < bounds.min) fail(reader, `${value} is below ${bounds.min}`);
        if (bounds.max !== undefined && value > bounds.max) fail(reader, `${value} is above ${bounds.max}`);
        return value;
    });

/** An integer or `*`, the `WILDCARDINT` type. */
export const wildcardIntegerArgument = (): BedrockDescribedType<number | '*'> =>
    basic('WILDCARDINT', (reader) => {
        if (reader.canRead() && reader.peek() === '*') {
            reader.skip();
            return '*';
        }
        return reader.readInt();
    });

/** A single word, the `ID` type. This is the fallback everything else degrades to. */
export const stringArgument = (): BedrockDescribedType<string> => basic('ID', readToken);

/** The rest of the line as one string, the `MESSAGE_ROOT` type. */
export const messageArgument = (): BedrockDescribedType<string> =>
    basic('MESSAGE_ROOT', (reader) => {
        const text = reader.getRemaining();
        reader.setCursor(reader.getTotalLength());
        return text;
    });

/** A `rawtext` JSON object, the `RAWTEXT` type. */
export const rawTextArgument = (): BedrockDescribedType<string> =>
    basic('RAWTEXT', (reader) => {
        const text = reader.getRemaining();
        reader.setCursor(reader.getTotalLength());
        return text;
    });

/** A JSON object, the `JSON_OBJECT` type. */
export const jsonArgument = (): BedrockDescribedType<string> =>
    basic('JSON_OBJECT', (reader) => {
        const text = reader.getRemaining();
        reader.setCursor(reader.getTotalLength());
        return text;
    });

/**
 * A `["name"="value"]` block state list, the `BLOCK_STATE_ARRAY` type.
 *
 * The leading bracket is required, and that is what keeps `/setblock` and
 * `/fill` unambiguous. Mojang's own grammar gives each of them two overloads,
 * `<block> <states> [mode]` and `<block> [mode]`, which only tell apart
 * because a state list cannot be spelled as a bare word: reading any token
 * here made `/setblock 1 2 3 dirt keep` parse `keep` as an empty state list
 * and place the block in replace mode.
 */
export const blockStatesArgument = (): BedrockDescribedType<string> =>
    basic('BLOCK_STATE_ARRAY', (reader) => {
        if (!reader.canRead() || reader.peek() !== '[') fail(reader, 'Expected a ["name"="value"] block state list');
        return readToken(reader);
    });

/** A function path, the `PATHCOMMAND` type. */
export const filePathArgument = (): BedrockDescribedType<string> => basic('PATHCOMMAND', readToken);

/** An `a..b`, `a..`, `..b` or `a` integer range, the `FULLINTEGERRANGE` type. */
export const integerRangeArgument = (): BedrockDescribedType<IntegerRange> =>
    basic('FULLINTEGERRANGE', (reader) => {
        const token = readToken(reader);
        const separator = token.indexOf('..');
        if (separator < 0) {
            const value = Number(token);
            if (!Number.isInteger(value)) fail(reader, `'${token}' is not an integer range`);
            return { min: value, max: value };
        }
        const low = token.slice(0, separator);
        const high = token.slice(separator + 2);
        if (low.length === 0 && high.length === 0) fail(reader, 'A range needs at least one bound');
        return {
            ...(low.length > 0 ? { min: Number(low) } : {}),
            ...(high.length > 0 ? { max: Number(high) } : {})
        };
    });

/** A scoreboard operation, the `OPERATOR` type. */
export const operationArgument = (): BedrockDescribedType<ScoreboardOperation> =>
    basic('OPERATOR', (reader) => {
        const token = readToken(reader);
        const operation = SCOREBOARD_OPERATIONS.find((candidate) => candidate === token);
        if (operation === undefined) fail(reader, `'${token}' is not a scoreboard operation`);
        return operation;
    });

/** A score comparison, the `COMPAREOPERATOR` type. */
export const compareOperatorArgument = (): BedrockDescribedType<CompareOperator> =>
    basic('COMPAREOPERATOR', (reader) => {
        const token = readToken(reader);
        const operator = COMPARE_OPERATORS.find((candidate) => candidate === token);
        if (operator === undefined) fail(reader, `'${token}' is not a comparison`);
        return operator;
    });

/**
 * The trailing command of `execute run`, the `CODEBUILDERARGS` type.
 *
 * Bedrock's own metadata spells `/execute run <command: CODEBUILDERARGS>`, so
 * this is the one place the client is told "the rest is another command".
 */
export const commandArgument = (): BedrockDescribedType<string> =>
    basic('CODEBUILDERARGS', (reader) => {
        const text = reader.getRemaining();
        reader.setCursor(reader.getTotalLength());
        return text;
    });

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * A fixed value list, which the packet sends as a hard enum.
 *
 * Every Bedrock subcommand keyword is one of these, usually with a single
 * value: Mojang's own metadata spells `/execute` with `OPTION_AS = ['as']`.
 *
 * @param name - The enum name the packet writes, Mojang's spelling where one exists.
 */
export const enumArgument = <const T extends string>(name: string, values: readonly T[]): BedrockDescribedType<T> => ({
    parse: (reader) => {
        const token = readToken(reader);
        const value = values.find((candidate) => candidate === token);
        if (value === undefined) fail(reader, `'${token}' is not one of ${values.join(', ')}`);
        return value;
    },
    describeBedrock: () => ({ kind: 'enum', name, values })
});

/**
 * A value list the server fills at runtime over `UpdateSoftEnumPacket`.
 *
 * Vanilla Bedrock has exactly four: `ScoreboardObjectives`, `TagValues`,
 * `GameTestName` and `GameTestTag`.
 */
export const softEnumArgument = (name: string): BedrockDescribedType<string> => ({
    parse: (reader) => readToken(reader),
    describeBedrock: () => ({ kind: 'softEnum', name })
});

/**
 * An integer with a unit suffix, which indexes the packet's postfix table.
 *
 * A postfixed parameter is the one kind with no `Valid` bit in its type word.
 *
 * @param postfix - The suffix, one of `t`, `s`, `d` or `l`.
 */
export const postfixIntegerArgument = (postfix: string): BedrockDescribedType<number> => ({
    parse: (reader) => {
        const token = readToken(reader);
        const digits = token.endsWith(postfix) ? token.slice(0, -postfix.length) : token;
        const value = Number(digits);
        if (!Number.isFinite(value)) fail(reader, `'${token}' is not a number of ${postfix}`);
        return value;
    },
    describeBedrock: () => ({ kind: 'postfix', postfix })
});

// ---------------------------------------------------------------------------
// The Java parsers Bedrock has no type for
// ---------------------------------------------------------------------------

const unrepresentable = <T>(gap: string, parse: (reader: StringReader) => T): BedrockDescribedType<T> => ({
    parse: (reader) => parse(reader),
    describeBedrock: () => undefined,
    bedrockGap: gap
});

const readGreedy = (reader: StringReader): string => {
    const text = reader.getRemaining();
    reader.setCursor(reader.getTotalLength());
    return text;
};

/** `minecraft:nbt_path`, the second most used parser in Java's tree. Bedrock has no NBT type. */
export const nbtPathArgument = (): BedrockDescribedType<string> =>
    unrepresentable('Bedrock has no nbt_path parameter type', readToken);

/** `minecraft:nbt_tag`, a single SNBT value. */
export const nbtTagArgument = (): BedrockDescribedType<string> =>
    unrepresentable('Bedrock has no nbt_tag parameter type', readGreedy);

/** `minecraft:nbt_compound_tag`, an SNBT compound. */
export const nbtCompoundArgument = (): BedrockDescribedType<string> =>
    unrepresentable('Bedrock has no nbt_compound_tag parameter type', readGreedy);

/** `minecraft:loot_modifier`, a standalone item modifier file id. */
export const itemModifierArgument = (): BedrockDescribedType<string> =>
    unrepresentable('Bedrock has no loot_modifier parameter type', readToken);

/** `minecraft:loot_predicate`, the argument of `execute if predicate`. */
export const lootPredicateArgument = (): BedrockDescribedType<string> =>
    unrepresentable('Bedrock has no loot_predicate parameter type', readToken);

/** `minecraft:loot_table`, the argument of `/loot` and `execute if items`. */
export const lootTableArgument = (): BedrockDescribedType<string> =>
    unrepresentable('Bedrock has no loot_table parameter type', readToken);

/**
 * The Bedrock hard enum Mojang's own command set completes each Java registry
 * from.
 *
 * `/summon <entityType: EntityType>` and `/give <itemName: Item>` are enums in
 * `mojang-commands.json`, with their contents published in the same file, so a
 * Java registry argument that has a Bedrock counterpart sends Mojang's own
 * list rather than degrading to an unvalidated string. Only the registries the
 * table names are here; the rest have no Bedrock parameter type at all.
 */
const BEDROCK_RESOURCE_ENUMS: Readonly<Record<string, string>> = {
    'minecraft:biome': 'Biome',
    'minecraft:block': 'Block',
    'minecraft:damage_type': 'DamageCause',
    'minecraft:enchantment': 'Enchant',
    'minecraft:entity_type': 'EntityType',
    'minecraft:item': 'Item',
    'minecraft:mob_effect': 'Effect'
};

/**
 * A registry id, `minecraft:resource` and its tag-accepting variants.
 *
 * Geyser's rule is the one to copy: the registries Bedrock publishes an enum
 * for become enums of their contents and everything else degrades to a string.
 * Pass `values` to override Mojang's list with the server's own, which is what
 * a server running content packs wants.
 *
 * @param registry - The registry id, used in the report and in the enum name
 *   when `values` is given.
 * @param values - The registry contents, when the caller can list them.
 */
export const resourceArgument = (registry: string, values?: readonly string[]): BedrockDescribedType<string> => {
    if (values !== undefined) return enumArgument(registry.replace(/[^\w]/g, '_'), values);

    const published = BEDROCK_RESOURCE_ENUMS[registry];
    const table = published === undefined ? undefined : bedrockCommandEnum(published);
    if (table === undefined) {
        return unrepresentable(`Bedrock has no parameter type for the ${registry} registry`, readToken);
    }

    // Mojang's lists are unnamespaced, `speed` rather than `minecraft:speed`,
    // and Java's commands take the full id. Both spellings parse, and the
    // value handed to a command body is always the id, so a host never has to
    // guess which edition wrote the line.
    return {
        parse: (reader) => {
            const token = readToken(reader);
            const bare = token.startsWith('minecraft:') ? token.slice('minecraft:'.length) : token;
            if (!table.values.includes(bare)) fail(reader, `'${token}' is not in the ${registry} registry`);
            return `minecraft:${bare}`;
        },
        describeBedrock: () => ({ kind: 'enum', name: table.name, values: table.values })
    };
};
