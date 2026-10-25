/**
 * Small parse combinators for the block component grammar.
 *
 * `@jsprismarine/content` takes a component schema as a plain function, so a
 * domain can inject whatever checking it already has. These build that
 * function from the shapes Mojang's `server/block/1.26.20/*.json` schemas
 * describe: ranged numbers, string enums, bounding boxes and objects whose
 * absent fields take the documented default. They stay in this package
 * because they encode Bedrock's conventions, not generic JSON validation.
 */
import type { ComponentSchema } from '@jsprismarine/content';
import { accepted, rejected } from '@jsprismarine/content';

/** A parse function for one JSON value, which is what a component schema is. */
export type Schema<P> = ComponentSchema<P>;

/** Whether a value is a plain JSON object rather than an array or null. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Accepts `true` and `false`. */
export const boolean: Schema<boolean> = (value) =>
    typeof value === 'boolean' ? accepted(value) : rejected('expected a boolean');

/** Accepts a finite number within an inclusive range. */
export const decimal =
    (min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY): Schema<number> =>
    (value) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) return rejected('expected a number');
        if (value < min || value > max) return rejected(`expected a number in ${min} to ${max}, got ${value}`);
        return accepted(value);
    };

/** Accepts a whole number within an inclusive range. */
export const integer =
    (min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY): Schema<number> =>
    (value) => {
        if (typeof value !== 'number' || !Number.isInteger(value)) return rejected('expected a whole number');
        if (value < min || value > max) return rejected(`expected a whole number in ${min} to ${max}, got ${value}`);
        return accepted(value);
    };

/** Accepts a string no longer than the limit Mojang's schemas put on it. */
export const text =
    (maxLength = 256): Schema<string> =>
    (value) => {
        if (typeof value !== 'string') return rejected('expected a string');
        if (value.length > maxLength) return rejected(`expected at most ${maxLength} characters`);
        return accepted(value);
    };

/** Accepts one of a declared set of names, keeping the literal type. */
export const oneOf =
    <const V extends readonly string[]>(values: V): Schema<V[number]> =>
    (value) => {
        if (typeof value !== 'string' || !values.includes(value)) {
            return rejected(`expected one of ${values.join(', ')}`);
        }
        return accepted(value);
    };

/** How many entries an array schema accepts. */
export interface LengthLimits {
    readonly min?: number;
    readonly max?: number;
}

/** Accepts an array whose every element parses, within an optional length range. */
export const list =
    <P>(item: Schema<P>, limits: LengthLimits = {}): Schema<readonly P[]> =>
    (value) => {
        if (!Array.isArray(value)) return rejected('expected an array');
        const { min = 0, max = Number.POSITIVE_INFINITY } = limits;
        if (value.length < min) return rejected(`expected at least ${min} entries`);
        if (value.length > max) return rejected(`expected at most ${max} entries`);
        const parsed: P[] = [];
        for (const [index, element] of value.entries()) {
            const result = item(element);
            if (!result.ok) return rejected(`[${index}]: ${result.message}`);
            parsed.push(result.value);
        }
        return accepted(parsed);
    };

/** Accepts an object whose every value parses, keyed by whatever names it has. */
export const table =
    <P>(value_: Schema<P>, maxProperties = Number.POSITIVE_INFINITY): Schema<Readonly<Record<string, P>>> =>
    (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const entries = Object.entries(value);
        if (entries.length > maxProperties) return rejected(`expected at most ${maxProperties} keys`);
        const parsed: Record<string, P> = {};
        for (const [key, element] of entries) {
            const result = value_(element);
            if (!result.ok) return rejected(`${key}: ${result.message}`);
            parsed[key] = result.value;
        }
        return accepted(parsed);
    };

/** Tries each schema in order and takes the first that accepts. */
export const either =
    <A, B>(first: Schema<A>, second: Schema<B>): Schema<A | B> =>
    (value) => {
        const left = first(value);
        if (left.ok) return left;
        const right = second(value);
        if (right.ok) return right;
        return rejected(`${left.message}, or ${right.message}`);
    };

/** Accepts anything and hands it back unparsed, for a field only the client reads. */
export const passThrough: Schema<unknown> = (value) => accepted(value);

/** One field of an object schema: where it is written and what fills it when absent. */
export interface Field<P> {
    /** The key as the JSON writes it, in snake case. */
    readonly key: string;
    readonly schema: Schema<P>;
    /** The value when the key is absent; a field with none is required. */
    readonly fallback?: P;
    readonly required?: boolean;
}

/** Declares an optional field and the default Mojang's schema documents for it. */
export const field = <P>(key: string, schema: Schema<P>, fallback: P): Field<P> => ({ key, schema, fallback });

/** Declares a field the component cannot parse without. */
export const requiredField = <P>(key: string, schema: Schema<P>): Field<P> => ({ key, schema, required: true });

/** The object one set of fields parses into, with each field's own value type. */
export type ShapeOf<F> = { readonly [K in keyof F]: F[K] extends Field<infer P> ? P : never };

/**
 * Builds a schema for a JSON object from its fields, renaming each snake-case
 * key to the camel-case name the parameters are read under.
 */
export const shape =
    <F extends Record<string, Field<unknown>>>(fields: F): Schema<ShapeOf<F>> =>
    (value) => {
        if (!isRecord(value)) return rejected('expected an object');

        const parsed: Record<string, unknown> = {};
        for (const [name, declared] of Object.entries<Field<unknown>>(fields)) {
            const raw = value[declared.key];
            if (raw === undefined) {
                if (declared.required) return rejected(`${declared.key} is required`);
                parsed[name] = declared.fallback;
                continue;
            }
            const result = declared.schema(raw);
            if (!result.ok) return rejected(`${declared.key}: ${result.message}`);
            parsed[name] = result.value;
        }

        // Each key was filled from the field of the same name, so the record
        // holds exactly the mapped type; TypeScript cannot carry that relation
        // through a string-keyed accumulator.
        return accepted(parsed as ShapeOf<F>);
    };

/** A three-component vector, which Mojang's schemas write as `[x, y, z]`. */
export type Vector3 = readonly [number, number, number];

/** Accepts `[x, y, z]`. */
export const vector3: Schema<Vector3> = (value) => {
    if (!Array.isArray(value) || value.length !== 3) return rejected('expected [x, y, z]');
    if (!value.every((part) => typeof part === 'number' && Number.isFinite(part))) {
        return rejected('expected three numbers');
    }
    return accepted([value[0], value[1], value[2]]);
};
