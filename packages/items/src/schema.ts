import type { ComponentSchema, ParseResult } from '@jsprismarine/content';
import { accepted, rejected } from '@jsprismarine/content';

/**
 * A parser for one JSON value, which is what `@jsprismarine/content` calls a
 * component schema. The combinators below compose into the parameter schema of
 * every item component.
 */
export type Parser<T> = ComponentSchema<T>;

/** The value a parser produces. */
export type Parsed<P> = P extends Parser<infer T> ? T : never;

const describe = (value: unknown): string => {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'a list';
    return typeof value;
};

/** Parses a JSON boolean. */
export const bool: Parser<boolean> = (value) =>
    typeof value === 'boolean' ? accepted(value) : rejected(`expected a boolean, got ${describe(value)}`);

/** Parses any JSON number, including a fractional one. */
export const float: Parser<number> = (value) =>
    typeof value === 'number' && Number.isFinite(value)
        ? accepted(value)
        : rejected(`expected a number, got ${describe(value)}`);

/**
 * Parses a whole JSON number.
 *
 * @param min - Smallest accepted value, inclusive.
 * @param max - Largest accepted value, inclusive.
 */
export const int =
    (min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER): Parser<number> =>
    (value) => {
        if (typeof value !== 'number' || !Number.isInteger(value)) {
            return rejected(`expected a whole number, got ${describe(value)}`);
        }
        if (value < min || value > max) return rejected(`expected a whole number from ${min} to ${max}, got ${value}`);
        return accepted(value);
    };

/** Parses a JSON string. */
export const text: Parser<string> = (value) =>
    typeof value === 'string' ? accepted(value) : rejected(`expected a string, got ${describe(value)}`);

/**
 * Parses a namespaced identifier such as `minecraft:stone`.
 *
 * An identifier with no namespace parses too, because Java's own reports write
 * the bare form in a few places and its registries default the namespace to
 * `minecraft`.
 */
export const identifier: Parser<string> = (value) => {
    if (typeof value !== 'string') return rejected(`expected an identifier, got ${describe(value)}`);
    if (!/^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]+$/.test(value)) return rejected(`${value} is not a namespaced identifier`);
    return accepted(value);
};

/** Parses one of a fixed set of strings. */
export const literalOf = <const T extends readonly string[]>(values: T): Parser<T[number]> => {
    const allowed = new Set<string>(values);
    return (value) => {
        if (typeof value !== 'string' || !allowed.has(value)) {
            return rejected(`expected one of ${values.join(', ')}, got ${JSON.stringify(value)}`);
        }
        // The set was built from T's members, so a hit is one of them.
        return accepted(value as T[number]);
    };
};

/** Parses a JSON list, every element through the same parser. */
export const listOf =
    <T>(element: Parser<T>): Parser<T[]> =>
    (value) => {
        if (!Array.isArray(value)) return rejected(`expected a list, got ${describe(value)}`);
        const parsed: T[] = [];
        for (const [index, item] of value.entries()) {
            const result = element(item);
            if (!result.ok) return rejected(`entry ${index}: ${result.message}`);
            parsed.push(result.value);
        }
        return accepted(parsed);
    };

/** Parses a JSON object whose keys are free and whose values share a parser. */
export const mapOf =
    <T>(entry: Parser<T>): Parser<Record<string, T>> =>
    (value) => {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            return rejected(`expected an object, got ${describe(value)}`);
        }
        const parsed: Record<string, T> = {};
        for (const [key, item] of Object.entries(value)) {
            const result = entry(item);
            if (!result.ok) return rejected(`key ${key}: ${result.message}`);
            parsed[key] = result.value;
        }
        return accepted(parsed);
    };

/** The shape {@link object} builds from a required and an optional field map. */
export type ObjectShape<R, O> = { [K in keyof R]: Parsed<R[K]> } & { [K in keyof O]?: Parsed<O[K]> };

/**
 * Parses a JSON object with named fields.
 *
 * Unknown keys parse and are dropped rather than failing, because Mojang adds
 * fields to a component within a release and a pinned schema that rejects them
 * would turn a data refresh into a load failure.
 *
 * @param required - Fields that must be present.
 * @param optional - Fields that may be present.
 */
export const object = <
    const R extends Record<string, Parser<unknown>>,
    const O extends Record<string, Parser<unknown>> = Record<never, never>
>(
    required: R,
    optional?: O
): Parser<ObjectShape<R, O>> => {
    const optionalFields = optional ?? ({} as O);
    return (value) => {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            return rejected(`expected an object, got ${describe(value)}`);
        }
        const source: Record<string, unknown> = { ...value };
        const parsed: Record<string, unknown> = {};

        for (const [key, parser] of Object.entries(required)) {
            if (!(key in source)) return rejected(`missing ${key}`);
            const result = parser(source[key]);
            if (!result.ok) return rejected(`${key}: ${result.message}`);
            parsed[key] = result.value;
        }
        for (const [key, parser] of Object.entries(optionalFields)) {
            if (!(key in source) || source[key] === undefined) continue;
            const result = parser(source[key]);
            if (!result.ok) return rejected(`${key}: ${result.message}`);
            parsed[key] = result.value;
        }

        // Each field went through its own parser, which is what the mapped
        // return type restates; TypeScript cannot carry that through a
        // string-keyed record built in a loop.
        return accepted(parsed as ObjectShape<R, O>);
    };
};

/**
 * Tries each parser in order and takes the first that accepts.
 *
 * @returns The first accepted value, or a rejection naming every attempt.
 */
export const either =
    <A, B>(first: Parser<A>, second: Parser<B>): Parser<A | B> =>
    (value) => {
        const a = first(value);
        if (a.ok) return a;
        const b = second(value);
        if (b.ok) return b;
        return rejected(`${a.message}; or ${b.message}`);
    };

/** Accepts any JSON value unchanged, for a value this package keeps opaque. */
export const json: Parser<unknown> = (value) => accepted(value);

/**
 * Accepts any JSON object unchanged.
 *
 * Used for the components whose value is an entity or block entity NBT
 * compound, which this package carries to the world layer without reading.
 */
export const compound: Parser<Readonly<Record<string, unknown>>> = (value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return rejected(`expected a compound, got ${describe(value)}`);
    }
    // A non-null, non-array object is string-keyed; TypeScript's `object`
    // type carries no index signature, so the entries say so instead.
    const entries: [string, unknown][] = Object.entries(value);
    return accepted(Object.fromEntries(entries));
};

/**
 * A set of registry entries the way Java 26.3 writes one: a `#tag` reference,
 * a single identifier, or a list of identifiers.
 */
export type HolderSet =
    { readonly kind: 'tag'; readonly tag: string } | { readonly kind: 'entries'; readonly entries: readonly string[] };

/** Parses a holder set in all three of its written forms. */
export const holderSet: Parser<HolderSet> = (value) => {
    if (typeof value === 'string') {
        if (value.startsWith('#')) return accepted({ kind: 'tag', tag: value.slice(1) });
        const single = identifier(value);
        return single.ok ? accepted({ kind: 'entries', entries: [single.value] }) : single;
    }
    const list = listOf(identifier)(value);
    return list.ok ? accepted({ kind: 'entries', entries: list.value }) : list;
};

/**
 * A number Java 26.3 writes either inline or as a reference into a
 * `context_int_provider` or `context_float_provider` file, which is the
 * indirection 26.3 moved fuel, compost and brewing values behind.
 */
export type NumberSource =
    | { readonly kind: 'inline'; readonly value: number }
    | { readonly kind: 'reference'; readonly id: string }
    | { readonly kind: 'provider'; readonly provider: Readonly<Record<string, unknown>> };

/** Parses a number in all three of the forms 26.3's providers accept. */
export const numberSource: Parser<NumberSource> = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return accepted({ kind: 'inline', value });
    if (typeof value === 'string') {
        const id = identifier(value);
        return id.ok ? accepted({ kind: 'reference', id: id.value }) : id;
    }
    const inline = compound(value);
    return inline.ok ? accepted({ kind: 'provider', provider: inline.value }) : inline;
};

/**
 * A Java text component, which is a string, a translation or style object, or
 * a list of either.
 */
export type TextComponent = string | Readonly<Record<string, unknown>> | readonly unknown[];

/** Parses a Java text component in each of its three written forms. */
export const textComponent: Parser<TextComponent> = (value) => {
    if (typeof value === 'string') return accepted(value);
    if (Array.isArray(value)) return accepted(value);
    return compound(value);
};

/** Narrows a parse result to its value, for a parser used inside another one. */
export const parsedOr = <T>(result: ParseResult<T>, fallback: T): T => (result.ok ? result.value : fallback);
