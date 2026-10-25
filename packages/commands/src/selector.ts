/**
 * The target selector grammar for both editions, parsed into one model.
 *
 * Java and Bedrock share argument names for `x`, `y`, `z`, `dx`, `dy`, `dz`,
 * `scores`, `tag`, `name` and `type` and disagree on everything else, so the
 * parser takes a dialect rather than merging the two grammars. Bedrock splits
 * each of Java's ranges into a maximum and a minimum (`distance` against `r`
 * and `rm`), spells gamemodes with shorthands, and folds Java's `limit` and
 * `sort` into one signed `c`. The parser normalizes all of that, so a caller
 * sees one shape whichever edition sent the string.
 *
 * An argument that belongs to the other edition still parses, and the result
 * carries a note naming it. A Bedrock client cannot type `predicate=` into its
 * own chat, but a `/execute` body the server built can carry one, and silently
 * dropping it would change which entities a command hits.
 *
 * Sources: `EntitySelectorParser` and `EntitySelectorOptions` in the Java 26.3
 * server jar for the 6 base selectors and 21 options, and Mojang's Bedrock
 * selector documentation plus its Bedrock changelogs for the 7 base selectors
 * and the Bedrock-only arguments. See
 * `docs/research/commands-functions-and-datapack-execution.md` section 6.
 */

/** Which edition's grammar a selector string is written in. */
export type SelectorDialect = 'java' | 'bedrock';

/** The base selectors. Java has the first six; Bedrock adds `@initiator`. */
export type SelectorBase = '@p' | '@a' | '@r' | '@e' | '@s' | '@n' | '@initiator';

/** How a selector orders its candidates before `limit` cuts the list. */
export type SelectorSort = 'nearest' | 'furthest' | 'random' | 'arbitrary';

/** An inclusive numeric range. Both bounds are optional, as in `a..`, `..b` and `a`. */
export interface SelectorRange {
    readonly min?: number;
    readonly max?: number;
}

/** One coordinate, either absolute or relative to the selector's origin. */
export interface SelectorCoordinate {
    readonly value: number;
    /** True for `~`, which Bedrock allows in `x`, `y` and `z` and Java does not. */
    readonly relative: boolean;
}

/** One value test. `negated` is the `!` prefix, which both editions allow on most arguments. */
export interface SelectorTest<T> {
    readonly value: T;
    readonly negated: boolean;
}

/** A `scores={obj=range}` entry. Bedrock also allows `!` inside the object. */
export interface SelectorScoreTest {
    readonly objective: string;
    readonly range: SelectorRange;
    readonly negated: boolean;
}

/** An `advancements={id=bool}` or `advancements={id={criterion=bool}}` entry, Java only. */
export interface SelectorAdvancementTest {
    readonly advancement: string;
    /** The whole-advancement test, present when the value was a boolean. */
    readonly granted?: boolean;
    /** Per-criterion tests, present when the value was an object. */
    readonly criteria?: Readonly<Record<string, boolean>>;
}

/** A `hasitem={...}` entry, Bedrock only. Every field is optional but `item`. */
export interface SelectorItemTest {
    readonly item: string;
    readonly data?: number;
    readonly quantity?: SelectorRange;
    readonly location?: string;
    readonly slot?: SelectorRange;
    readonly negated: boolean;
}

/** A `has_property={...}` entry, Bedrock only. */
export interface SelectorPropertyTest {
    readonly property: string;
    /** The required value, absent when the test only asks whether the property exists. */
    readonly value?: string;
    readonly negated: boolean;
}

/**
 * One parsed target selector, in whichever dialect it arrived.
 *
 * Every field is normalized onto the Java spelling, because the Java grammar
 * is the wider of the two. The Bedrock-only arguments keep their own fields
 * because Java has nothing to normalize them onto.
 */
export interface SelectorModel {
    readonly base: SelectorBase;
    readonly dialect: SelectorDialect;
    /** The player name or UUID the string named instead of a base selector. */
    readonly literal?: string;
    readonly x?: SelectorCoordinate;
    readonly y?: SelectorCoordinate;
    readonly z?: SelectorCoordinate;
    readonly dx?: number;
    readonly dy?: number;
    readonly dz?: number;
    /** Java `distance`, Bedrock `r` and `rm`. */
    readonly distance?: SelectorRange;
    /** Java `level`, Bedrock `l` and `lm`. Players only. */
    readonly level?: SelectorRange;
    /** Java `x_rotation`, Bedrock `rx` and `rxm`. */
    readonly xRotation?: SelectorRange;
    /** Java `y_rotation`, Bedrock `ry` and `rym`. */
    readonly yRotation?: SelectorRange;
    /** Java `limit`, the magnitude of Bedrock's `c`. */
    readonly limit?: number;
    /** Java `sort`. A negative Bedrock `c` means `furthest`. */
    readonly sort?: SelectorSort;
    readonly gamemode: readonly SelectorTest<string>[];
    readonly name: readonly SelectorTest<string>[];
    readonly type: readonly SelectorTest<string>[];
    readonly tag: readonly SelectorTest<string>[];
    readonly scores: readonly SelectorScoreTest[];
    /** Java `team`. Bedrock has no teams. */
    readonly team: readonly SelectorTest<string>[];
    /** Java `nbt`, an SNBT compound kept as source text. */
    readonly nbt: readonly SelectorTest<string>[];
    /** Java `predicate`, a datapack predicate id. */
    readonly predicate: readonly SelectorTest<string>[];
    /** Java `advancements`. */
    readonly advancements: readonly SelectorAdvancementTest[];
    /** Bedrock `family`, a `minecraft:type_family` component value. */
    readonly family: readonly SelectorTest<string>[];
    /** Bedrock `hasitem`. */
    readonly hasItem: readonly SelectorItemTest[];
    /** Bedrock `haspermission`, a map of permission name to `enabled` or `disabled`. */
    readonly hasPermission: Readonly<Record<string, string>>;
    /** Bedrock `has_property`. */
    readonly hasProperty: readonly SelectorPropertyTest[];
}

/** Why a parsed argument is worth telling the caller about. */
export type SelectorNoteReason = 'java-only' | 'bedrock-only' | 'no-counterpart';

/** One argument that parsed but does not belong to the dialect it arrived in. */
export interface SelectorNote {
    /** The argument as it was spelled in the input. */
    readonly argument: string;
    readonly reason: SelectorNoteReason;
    readonly message: string;
}

/** A parsed selector and everything the parser wants the caller to know about it. */
export interface SelectorParseResult {
    readonly selector: SelectorModel;
    /** Arguments from the other edition's grammar, in the order they appeared. */
    readonly notes: readonly SelectorNote[];
}

/** Thrown when a selector string does not parse in the requested dialect. */
export class SelectorSyntaxError extends Error {
    /** The zero-based offset in the input where parsing stopped. */
    public readonly position: number;

    public constructor(message: string, position: number) {
        super(`${message} at position ${position}`);
        this.name = 'SelectorSyntaxError';
        this.position = position;
    }
}

/** The six base selectors Java's `EntitySelectorParser` declares. */
export const JAVA_BASE_SELECTORS: readonly SelectorBase[] = ['@a', '@e', '@n', '@p', '@r', '@s'];

/** The seven base selectors Bedrock accepts, Java's six plus `@initiator`. */
export const BEDROCK_BASE_SELECTORS: readonly SelectorBase[] = [...JAVA_BASE_SELECTORS, '@initiator'];

/** The 21 selector arguments Java's `EntitySelectorOptions` names. */
export const JAVA_SELECTOR_ARGUMENTS: readonly string[] = [
    'advancements',
    'distance',
    'dx',
    'dy',
    'dz',
    'gamemode',
    'level',
    'limit',
    'name',
    'nbt',
    'predicate',
    'scores',
    'sort',
    'tag',
    'team',
    'type',
    'x',
    'x_rotation',
    'y',
    'y_rotation',
    'z'
];

/** The selector arguments Bedrock accepts. */
export const BEDROCK_SELECTOR_ARGUMENTS: readonly string[] = [
    'c',
    'dx',
    'dy',
    'dz',
    'family',
    'has_property',
    'hasitem',
    'haspermission',
    'l',
    'lm',
    'm',
    'name',
    'r',
    'rm',
    'rx',
    'rxm',
    'ry',
    'rym',
    'scores',
    'tag',
    'type',
    'x',
    'y',
    'z'
];

/**
 * The Java arguments with no Bedrock expression at all, from the research
 * note's gap table. `sort=arbitrary` is a fourth gap, but it is a value rather
 * than an argument, so it is not listed here.
 */
export const JAVA_ONLY_SELECTOR_ARGUMENTS: readonly string[] = ['advancements', 'nbt', 'predicate', 'team'];

/** The Bedrock arguments with no Java expression. */
export const BEDROCK_ONLY_SELECTOR_ARGUMENTS: readonly string[] = [
    'family',
    'has_property',
    'hasitem',
    'haspermission'
];

/** Bedrock's gamemode shorthands, which Java does not accept. */
const BEDROCK_GAMEMODE_ALIASES: Readonly<Record<string, string>> = {
    s: 'survival',
    '0': 'survival',
    c: 'creative',
    '1': 'creative',
    a: 'adventure',
    '2': 'adventure',
    d: 'spectator',
    '5': 'spectator',
    survival: 'survival',
    creative: 'creative',
    adventure: 'adventure',
    spectator: 'spectator',
    default: 'default'
};

/** The `limit` and `sort` each base selector defaults to. */
const BASE_DEFAULTS: Readonly<Record<SelectorBase, { limit?: number; sort: SelectorSort }>> = {
    '@p': { limit: 1, sort: 'nearest' },
    '@r': { limit: 1, sort: 'random' },
    '@n': { limit: 1, sort: 'nearest' },
    '@s': { limit: 1, sort: 'nearest' },
    '@initiator': { limit: 1, sort: 'nearest' },
    '@a': { sort: 'arbitrary' },
    '@e': { sort: 'arbitrary' }
};

// ---------------------------------------------------------------------------
// The reader
// ---------------------------------------------------------------------------

class SelectorReader {
    public cursor = 0;

    public constructor(public readonly input: string) {}

    public peek(): string {
        return this.input[this.cursor] ?? '';
    }

    public atEnd(): boolean {
        return this.cursor >= this.input.length;
    }

    public skipWhitespace(): void {
        while (!this.atEnd() && /\s/.test(this.peek())) this.cursor += 1;
    }

    public expect(character: string): void {
        this.skipWhitespace();
        if (this.peek() !== character) {
            throw new SelectorSyntaxError(`Expected '${character}'`, this.cursor);
        }
        this.cursor += 1;
    }

    /** Reads a bare word, or a quoted string with backslash escapes. */
    public readValue(): string {
        this.skipWhitespace();
        const quote = this.peek();
        if (quote === '"' || quote === "'") return this.readQuoted(quote);

        const start = this.cursor;
        while (!this.atEnd() && /[\w.+:#*/~^-]/.test(this.peek())) this.cursor += 1;
        return this.input.slice(start, this.cursor);
    }

    private readQuoted(quote: string): string {
        this.cursor += 1;
        let value = '';
        while (true) {
            if (this.atEnd()) throw new SelectorSyntaxError('Unterminated quoted string', this.cursor);
            const character = this.input[this.cursor]!;
            this.cursor += 1;
            if (character === '\\') {
                if (this.atEnd()) throw new SelectorSyntaxError('Unterminated escape', this.cursor);
                value += this.input[this.cursor];
                this.cursor += 1;
                continue;
            }
            if (character === quote) return value;
            value += character;
        }
    }

    /** Reads a balanced `{...}` or `[...]` run, braces included, as source text. */
    public readBalanced(open: string, close: string): string {
        this.skipWhitespace();
        const start = this.cursor;
        let depth = 0;
        while (!this.atEnd()) {
            const character = this.input[this.cursor]!;
            if (character === '"' || character === "'") {
                this.readQuoted(character);
                continue;
            }
            this.cursor += 1;
            if (character === open) depth += 1;
            else if (character === close) {
                depth -= 1;
                if (depth === 0) return this.input.slice(start, this.cursor);
            }
        }
        throw new SelectorSyntaxError(`Unterminated '${open}'`, start);
    }
}

const parseNumber = (text: string, position: number): number => {
    const value = Number(text);
    if (text.length === 0 || !Number.isFinite(value)) {
        throw new SelectorSyntaxError(`'${text}' is not a number`, position);
    }
    return value;
};

const parseInteger = (text: string, position: number): number => {
    const value = parseNumber(text, position);
    if (!Number.isInteger(value)) throw new SelectorSyntaxError(`'${text}' is not an integer`, position);
    return value;
};

const parseRange = (text: string, position: number): SelectorRange => {
    const separator = text.indexOf('..');
    if (separator < 0) {
        const value = parseNumber(text, position);
        return { min: value, max: value };
    }
    const low = text.slice(0, separator);
    const high = text.slice(separator + 2);
    if (low.length === 0 && high.length === 0) {
        throw new SelectorSyntaxError('A range needs at least one bound', position);
    }
    return {
        ...(low.length > 0 ? { min: parseNumber(low, position) } : {}),
        ...(high.length > 0 ? { max: parseNumber(high, position) } : {})
    };
};

const parseCoordinate = (text: string, position: number): SelectorCoordinate => {
    if (text.startsWith('~')) {
        const rest = text.slice(1);
        return { value: rest.length === 0 ? 0 : parseNumber(rest, position), relative: true };
    }
    return { value: parseNumber(text, position), relative: false };
};

/** Splits a `{a=b,c=d}` run into its entries, respecting nesting and quotes. */
const splitObject = (source: string, position: number): { key: string; value: string; negated: boolean }[] => {
    const body = source.slice(1, -1);
    const entries: { key: string; value: string; negated: boolean }[] = [];
    let depth = 0;
    let quote = '';
    let current = '';
    const push = () => {
        const text = current.trim();
        current = '';
        if (text.length === 0) return;
        const equals = text.indexOf('=');
        if (equals < 0) throw new SelectorSyntaxError(`'${text}' is not a key=value pair`, position);
        const value = text.slice(equals + 1).trim();
        const negated = value.startsWith('!');
        entries.push({
            key: text.slice(0, equals).trim(),
            value: negated ? value.slice(1).trim() : value,
            negated
        });
    };

    for (const character of body) {
        if (quote !== '') {
            current += character;
            if (character === quote) quote = '';
            continue;
        }
        if (character === '"' || character === "'") {
            quote = character;
            current += character;
            continue;
        }
        if (character === '{' || character === '[') depth += 1;
        if (character === '}' || character === ']') depth -= 1;
        if (character === ',' && depth === 0) {
            push();
            continue;
        }
        current += character;
    }
    push();
    return entries;
};

const unquote = (text: string): string =>
    (text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))
        ? text.slice(1, -1)
        : text;

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------

interface MutableModel {
    base: SelectorBase;
    literal?: string;
    x?: SelectorCoordinate;
    y?: SelectorCoordinate;
    z?: SelectorCoordinate;
    dx?: number;
    dy?: number;
    dz?: number;
    distance?: SelectorRange;
    level?: SelectorRange;
    xRotation?: SelectorRange;
    yRotation?: SelectorRange;
    limit?: number;
    sort?: SelectorSort;
    gamemode: SelectorTest<string>[];
    name: SelectorTest<string>[];
    type: SelectorTest<string>[];
    tag: SelectorTest<string>[];
    scores: SelectorScoreTest[];
    team: SelectorTest<string>[];
    nbt: SelectorTest<string>[];
    predicate: SelectorTest<string>[];
    advancements: SelectorAdvancementTest[];
    family: SelectorTest<string>[];
    hasItem: SelectorItemTest[];
    hasPermission: Record<string, string>;
    hasProperty: SelectorPropertyTest[];
}

const emptyModel = (base: SelectorBase): MutableModel => ({
    base,
    gamemode: [],
    name: [],
    type: [],
    tag: [],
    scores: [],
    team: [],
    nbt: [],
    predicate: [],
    advancements: [],
    family: [],
    hasItem: [],
    hasPermission: {},
    hasProperty: []
});

const SORTS: readonly SelectorSort[] = ['nearest', 'furthest', 'random', 'arbitrary'];

const isSort = (value: string): value is SelectorSort => SORTS.includes(value as SelectorSort);

const withBound = (existing: SelectorRange | undefined, bound: Partial<SelectorRange>): SelectorRange => ({
    ...existing,
    ...bound
});

const applyArgument = (
    model: MutableModel,
    dialect: SelectorDialect,
    key: string,
    rawValue: string,
    negated: boolean,
    position: number,
    notes: SelectorNote[]
): void => {
    const value = unquote(rawValue);
    const known = dialect === 'java' ? JAVA_SELECTOR_ARGUMENTS : BEDROCK_SELECTOR_ARGUMENTS;
    const other = dialect === 'java' ? BEDROCK_SELECTOR_ARGUMENTS : JAVA_SELECTOR_ARGUMENTS;

    if (!known.includes(key)) {
        if (!other.includes(key)) {
            throw new SelectorSyntaxError(`Unknown selector argument '${key}'`, position);
        }
        notes.push({
            argument: key,
            reason: dialect === 'bedrock' ? 'java-only' : 'bedrock-only',
            message:
                dialect === 'bedrock'
                    ? `'${key}' is a Java selector argument; a Bedrock client cannot type it. It was parsed anyway.`
                    : `'${key}' is a Bedrock selector argument; Java has no counterpart. It was parsed anyway.`
        });
    } else if (dialect === 'java' && JAVA_ONLY_SELECTOR_ARGUMENTS.includes(key)) {
        notes.push({
            argument: key,
            reason: 'no-counterpart',
            message: `'${key}' has no Bedrock expression, so a Bedrock client cannot be shown this selector.`
        });
    } else if (dialect === 'bedrock' && BEDROCK_ONLY_SELECTOR_ARGUMENTS.includes(key)) {
        notes.push({
            argument: key,
            reason: 'no-counterpart',
            message: `'${key}' has no Java expression, so this selector cannot be written as Java.`
        });
    }

    switch (key) {
        case 'x':
            model.x = parseCoordinate(value, position);
            return;
        case 'y':
            model.y = parseCoordinate(value, position);
            return;
        case 'z':
            model.z = parseCoordinate(value, position);
            return;
        case 'dx':
            model.dx = parseNumber(value, position);
            return;
        case 'dy':
            model.dy = parseNumber(value, position);
            return;
        case 'dz':
            model.dz = parseNumber(value, position);
            return;
        case 'distance': {
            const range = parseRange(value, position);
            if ((range.min ?? 0) < 0 || (range.max ?? 0) < 0) {
                throw new SelectorSyntaxError('distance cannot be negative', position);
            }
            model.distance = range;
            return;
        }
        case 'r':
            model.distance = withBound(model.distance, { max: parseNumber(value, position) });
            return;
        case 'rm':
            model.distance = withBound(model.distance, { min: parseNumber(value, position) });
            return;
        case 'level': {
            const range = parseRange(value, position);
            if ((range.min ?? 0) < 0 || (range.max ?? 0) < 0) {
                throw new SelectorSyntaxError('level cannot be negative', position);
            }
            model.level = range;
            return;
        }
        case 'l':
            model.level = withBound(model.level, { max: parseInteger(value, position) });
            return;
        case 'lm':
            model.level = withBound(model.level, { min: parseInteger(value, position) });
            return;
        case 'x_rotation':
            model.xRotation = parseRange(value, position);
            return;
        case 'rx':
            model.xRotation = withBound(model.xRotation, { max: parseNumber(value, position) });
            return;
        case 'rxm':
            model.xRotation = withBound(model.xRotation, { min: parseNumber(value, position) });
            return;
        case 'y_rotation':
            model.yRotation = parseRange(value, position);
            return;
        case 'ry':
            model.yRotation = withBound(model.yRotation, { max: parseNumber(value, position) });
            return;
        case 'rym':
            model.yRotation = withBound(model.yRotation, { min: parseNumber(value, position) });
            return;
        case 'limit': {
            const limit = parseInteger(value, position);
            if (limit < 1) throw new SelectorSyntaxError('limit must be at least 1', position);
            model.limit = limit;
            return;
        }
        case 'c': {
            // Bedrock folds Java's `limit` and `sort` into one signed count.
            const count = parseInteger(value, position);
            if (count === 0) throw new SelectorSyntaxError('c cannot be 0', position);
            model.limit = Math.abs(count);
            model.sort = count < 0 ? 'furthest' : 'nearest';
            return;
        }
        case 'sort':
            if (!isSort(value)) throw new SelectorSyntaxError(`Unknown sort '${value}'`, position);
            model.sort = value;
            return;
        case 'gamemode':
            model.gamemode.push({ value, negated });
            return;
        case 'm': {
            const gamemode = BEDROCK_GAMEMODE_ALIASES[value.toLowerCase()];
            if (gamemode === undefined) throw new SelectorSyntaxError(`Unknown gamemode '${value}'`, position);
            model.gamemode.push({ value: gamemode, negated });
            return;
        }
        case 'name':
            model.name.push({ value, negated });
            return;
        case 'type':
            model.type.push({ value, negated });
            return;
        case 'tag':
            model.tag.push({ value, negated });
            return;
        case 'team':
            model.team.push({ value, negated });
            return;
        case 'nbt':
            model.nbt.push({ value: rawValue, negated });
            return;
        case 'predicate':
            model.predicate.push({ value, negated });
            return;
        case 'family':
            model.family.push({ value, negated });
            return;
        case 'scores':
            for (const entry of splitObject(rawValue, position)) {
                model.scores.push({
                    objective: entry.key,
                    range: parseRange(unquote(entry.value), position),
                    negated: entry.negated
                });
            }
            return;
        case 'advancements':
            for (const entry of splitObject(rawValue, position)) {
                if (entry.value.startsWith('{')) {
                    const criteria: Record<string, boolean> = {};
                    for (const criterion of splitObject(entry.value, position)) {
                        criteria[criterion.key] = criterion.value === 'true';
                    }
                    model.advancements.push({ advancement: entry.key, criteria });
                    continue;
                }
                model.advancements.push({ advancement: entry.key, granted: entry.value === 'true' });
            }
            return;
        case 'haspermission':
            for (const entry of splitObject(rawValue, position)) {
                model.hasPermission[entry.key] = unquote(entry.value);
            }
            return;
        case 'has_property':
            for (const entry of splitObject(rawValue, position)) {
                if (entry.key === 'property') {
                    model.hasProperty.push({ property: unquote(entry.value), negated: entry.negated });
                    continue;
                }
                model.hasProperty.push({
                    property: entry.key,
                    value: unquote(entry.value),
                    negated: entry.negated
                });
            }
            return;
        case 'hasitem':
            // `hasitem` is one object or a list of them.
            for (const source of rawValue.startsWith('[')
                ? splitList(rawValue, position)
                : [{ text: rawValue, negated }]) {
                model.hasItem.push(parseItemTest(source.text, source.negated, position));
            }
            return;
        default:
            throw new SelectorSyntaxError(`Unknown selector argument '${key}'`, position);
    }
};

/** Splits a `[{...},{...}]` run into its elements, each with its own `!`. */
const splitList = (source: string, position: number): { text: string; negated: boolean }[] => {
    const body = source.slice(1, -1);
    const elements: { text: string; negated: boolean }[] = [];
    let depth = 0;
    let current = '';
    const push = () => {
        const text = current.trim();
        current = '';
        if (text.length === 0) return;
        const negated = text.startsWith('!');
        elements.push({ text: negated ? text.slice(1).trim() : text, negated });
    };
    for (const character of body) {
        if (character === '{' || character === '[') depth += 1;
        if (character === '}' || character === ']') depth -= 1;
        if (character === ',' && depth === 0) {
            push();
            continue;
        }
        current += character;
    }
    push();
    if (elements.length === 0) throw new SelectorSyntaxError('Empty hasitem list', position);
    return elements;
};

const parseItemTest = (source: string, negated: boolean, position: number): SelectorItemTest => {
    let item: string | undefined;
    let data: number | undefined;
    let quantity: SelectorRange | undefined;
    let location: string | undefined;
    let slot: SelectorRange | undefined;

    for (const entry of splitObject(source, position)) {
        const value = unquote(entry.value);
        if (entry.key === 'item') item = value;
        else if (entry.key === 'data') data = parseInteger(value, position);
        else if (entry.key === 'quantity') quantity = parseRange(value, position);
        else if (entry.key === 'location') location = value;
        else if (entry.key === 'slot') slot = parseRange(value, position);
        else throw new SelectorSyntaxError(`Unknown hasitem field '${entry.key}'`, position);
    }
    if (item === undefined) throw new SelectorSyntaxError('hasitem needs an item', position);
    return {
        item,
        negated,
        ...(data === undefined ? {} : { data }),
        ...(quantity === undefined ? {} : { quantity }),
        ...(location === undefined ? {} : { location }),
        ...(slot === undefined ? {} : { slot })
    };
};

const freeze = (model: MutableModel, dialect: SelectorDialect): SelectorModel => {
    const defaults = BASE_DEFAULTS[model.base];
    return {
        ...model,
        dialect,
        limit: model.limit ?? defaults.limit,
        sort: model.sort ?? defaults.sort
    };
};

/**
 * Parses one target selector in the given dialect.
 *
 * The reader stops at the first character that cannot continue the selector,
 * so a caller parsing a command line can read the rest from `result.length`.
 *
 * @param input - The selector, starting at `@` or at a player name or UUID.
 * @param dialect - Which edition's grammar to read, and which arguments to
 *   note as belonging to the other one.
 * @returns The selector model and the notes the parse produced.
 * @throws {SelectorSyntaxError} When the string does not parse in either grammar.
 */
export const parseSelector = (input: string, dialect: SelectorDialect): SelectorParseResult => {
    const reader = new SelectorReader(input);
    const notes: SelectorNote[] = [];
    reader.skipWhitespace();

    if (reader.peek() !== '@') {
        const literal = reader.readValue();
        if (literal.length === 0) throw new SelectorSyntaxError('Expected a selector', reader.cursor);
        const model = emptyModel('@p');
        model.literal = literal;
        model.limit = 1;
        return { selector: freeze(model, dialect), notes };
    }

    const bases = dialect === 'java' ? JAVA_BASE_SELECTORS : BEDROCK_BASE_SELECTORS;
    // Longest first, so `@initiator` wins over no match at all rather than
    // being read as `@i`.
    const matched = [...bases]
        .sort((a, b) => b.length - a.length)
        .find((candidate) => input.startsWith(candidate, reader.cursor));
    if (matched === undefined) {
        if (input.startsWith('@initiator', reader.cursor)) {
            throw new SelectorSyntaxError("'@initiator' is a Bedrock base selector", reader.cursor);
        }
        throw new SelectorSyntaxError(
            `Unknown base selector '${input.slice(reader.cursor, reader.cursor + 2)}'`,
            reader.cursor
        );
    }
    reader.cursor += matched.length;

    const model = emptyModel(matched);
    if (reader.peek() !== '[') return { selector: freeze(model, dialect), notes };

    reader.cursor += 1;
    reader.skipWhitespace();
    if (reader.peek() === ']') {
        reader.cursor += 1;
        return { selector: freeze(model, dialect), notes };
    }

    while (true) {
        reader.skipWhitespace();
        const keyAt = reader.cursor;
        const key = reader.readValue();
        if (key.length === 0) throw new SelectorSyntaxError('Expected a selector argument name', keyAt);
        reader.expect('=');
        reader.skipWhitespace();

        const negated = reader.peek() === '!';
        if (negated) reader.cursor += 1;
        reader.skipWhitespace();

        const valueAt = reader.cursor;
        const next = reader.peek();
        const value =
            next === '{'
                ? reader.readBalanced('{', '}')
                : next === '['
                  ? reader.readBalanced('[', ']')
                  : reader.readValue();

        applyArgument(model, dialect, key, value, negated, valueAt, notes);

        reader.skipWhitespace();
        if (reader.peek() === ',') {
            reader.cursor += 1;
            continue;
        }
        reader.expect(']');
        break;
    }

    return { selector: freeze(model, dialect), notes };
};
