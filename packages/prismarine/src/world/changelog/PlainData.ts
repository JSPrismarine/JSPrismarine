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

/**
 * Copies a value built from plain parts into {@link PlainData}, the way a JSON round trip would
 * but without the string: an object field holding `undefined` is left out and an array item
 * holding `undefined` becomes `null`. Typed arrays are copied.
 *
 * Entity state holds interfaces such as an item stack or a position, which the compiler cannot
 * prove plain because an interface has no index signature, so a setter that logs one copies it
 * through here.
 * @param {unknown} value - The value to copy.
 * @returns {PlainData | undefined} The copy, or undefined when the value, or a part of it, has
 * no plain form: a function, a symbol, `undefined` itself, or an object with a prototype of its
 * own such as a `Map`.
 */
export function plainOf(value: unknown): PlainData | undefined {
    switch (typeof value) {
        case 'number':
        case 'bigint':
        case 'boolean':
        case 'string':
            return value;
        case 'object':
            break;
        default:
            return undefined;
    }
    if (value === null) return null;
    if (ArrayBuffer.isView(value)) return isTypedArray(value) ? value.slice() : undefined;
    if (Array.isArray(value)) {
        const items: PlainData[] = [];
        for (const item of value) {
            const plain = item === undefined ? null : plainOf(item);
            if (plain === undefined) return undefined;
            items.push(plain);
        }
        return items;
    }
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    const record: Record<string, PlainData> = {};
    for (const [key, item] of Object.entries(value)) {
        if (item === undefined) continue;
        const plain = plainOf(item);
        if (plain === undefined) return undefined;
        record[key] = plain;
    }
    return record;
}

/**
 * Whether two plain values hold the same data: equal primitives, typed arrays of the same kind
 * with equal elements, arrays with equal items in order, and objects with the same keys holding
 * equal values in any order.
 * @param {PlainData} left - One value.
 * @param {PlainData} right - The other.
 * @returns {boolean} Whether they are equal.
 */
export function samePlain(left: PlainData, right: PlainData): boolean {
    if (left === right) return true;
    if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
    if (ArrayBuffer.isView(left) || ArrayBuffer.isView(right)) {
        if (!ArrayBuffer.isView(left) || !ArrayBuffer.isView(right)) return false;
        if (left.constructor !== right.constructor || left.length !== right.length) return false;
        for (let index = 0; index < left.length; index++) if (left[index] !== right[index]) return false;
        return true;
    }
    if (isPlainList(left) || isPlainList(right)) {
        if (!isPlainList(left) || !isPlainList(right) || left.length !== right.length) return false;
        for (let index = 0; index < left.length; index++) {
            const mine = left[index];
            const theirs = right[index];
            if (mine === undefined || theirs === undefined || !samePlain(mine, theirs)) return false;
        }
        return true;
    }
    const keys = Object.keys(left);
    if (keys.length !== Object.keys(right).length) return false;
    for (const key of keys) {
        const mine = left[key];
        const theirs = right[key];
        if (mine === undefined || theirs === undefined || !samePlain(mine, theirs)) return false;
    }
    return true;
}

/**
 * Whether a plain value is an object of plain values, and not a list, a typed array or a
 * primitive.
 * @param {PlainData} value - The value.
 * @returns {boolean} Whether it is a {@link PlainRecord}.
 */
export function isPlainRecord(value: PlainData): value is PlainRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value) && !ArrayBuffer.isView(value);
}

/**
 * Whether a plain value is a list. `Array.isArray` does not narrow a `readonly` array type out
 * of a union, so code that walks plain data asks this instead.
 * @param {PlainData} value - The value.
 * @returns {boolean} Whether it is a list.
 */
export function isPlainList(value: PlainData): value is readonly PlainData[] {
    return Array.isArray(value);
}

// A `DataView` is an `ArrayBufferView` too, and the structured clone keeps it, but plain data
// does not include one.
function isTypedArray(value: ArrayBufferView): value is PlainTypedArray {
    return !(value instanceof DataView);
}
