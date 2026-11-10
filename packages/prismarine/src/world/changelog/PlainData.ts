/**
 * A typed array: the one kind of class instance plain data may hold.
 *
 * The structured clone algorithm copies these, so a value holding one can still cross to
 * another thread ([ADR 0011](../../../../../docs/adr/0011-a-world-exchanges-only-plain-data.md)).
 */
export type PlainTypedArray =
    | Int8Array
    | Uint8Array
    | Uint8ClampedArray
    | Int16Array
    | Uint16Array
    | Int32Array
    | Uint32Array
    | Float32Array
    | Float64Array
    | BigInt64Array
    | BigUint64Array;

/**
 * A value that survives a structured clone unchanged: ids, numbers, strings, plain objects,
 * arrays and typed arrays.
 *
 * No functions, no class instances with behavior and no `undefined`, so an object with methods
 * (a `Vector3`, an entity) does not satisfy it and the compiler rejects it where plain data is
 * required.
 */
export type PlainData =
    null | boolean | number | bigint | string | PlainTypedArray | readonly PlainData[] | PlainRecord;

/**
 * An object whose every property is {@link PlainData}.
 *
 * Declare a shape that has to satisfy it with a `type` alias, not an `interface`: only an
 * object type literal gets the implicit index signature that makes it assignable here.
 */
export type PlainRecord = { readonly [key: string]: PlainData };
