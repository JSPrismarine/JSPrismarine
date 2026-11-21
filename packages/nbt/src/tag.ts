/**
 * NBT as immutable plain data: every tag is a record with its type beside its value.
 *
 * `NBTTagCompound` reads and writes the binary format and infers a tag's type from the
 * wrapper class around its value. That works for a codec, but not for a value that commands
 * edit, compare, copy and log. A list there is a `Set`, so it has no index for `/data modify
 * … insert 2` to address. An `int` and a `double` holding the same number differ only in their
 * wrappers. And a change log entry has to hold a copy that later writes cannot reach.
 *
 * A tag here is a frozen record, a list is an array, a compound is a record keyed by name and
 * a long is a `bigint`, so a tag is plain data that can be stored and compared directly. An edit builds a new
 * tag and shares every subtree it left alone; see `./path` for the edits.
 *
 * A list may hold tags of different types. Java has allowed that since 1.21.5: its SNBT
 * reader accepts `[1, "a"]`, and its binary writer wraps each element of a mixed list in a
 * compound under the empty key. This module keeps the elements as they are.
 */

/** A tag of one of the six numeric types. */
export type NbtNumericTag =
    | { readonly type: 'byte'; readonly value: number }
    | { readonly type: 'short'; readonly value: number }
    | { readonly type: 'int'; readonly value: number }
    | { readonly type: 'long'; readonly value: bigint }
    | { readonly type: 'float'; readonly value: number }
    | { readonly type: 'double'; readonly value: number };

/** A tag of one of the three typed array types, `[B; …]`, `[I; …]` and `[L; …]` in SNBT. */
export type NbtArrayTag =
    | { readonly type: 'byte_array'; readonly value: Int8Array }
    | { readonly type: 'int_array'; readonly value: Int32Array }
    | { readonly type: 'long_array'; readonly value: BigInt64Array };

/** A compound's entries, by name. Built with {@link compoundOf}, so a key such as `__proto__` is an entry. */
export type NbtCompound = { readonly [key: string]: NbtTag };

/** Any NBT tag. */
export type NbtTag =
    | NbtNumericTag
    | NbtArrayTag
    | { readonly type: 'string'; readonly value: string }
    | { readonly type: 'list'; readonly value: readonly NbtTag[] }
    | { readonly type: 'compound'; readonly value: NbtCompound };

/** The type names a tag can have. */
export type NbtTagType = NbtTag['type'];

/** The tag of one type. */
export type NbtTagOf<T extends NbtTagType> = Extract<NbtTag, { readonly type: T }>;

/** A list or a typed array: the tags `/data modify … append` and `insert` write into. */
export type NbtCollectionTag = NbtArrayTag | NbtTagOf<'list'>;

/** The compound tag. */
export type NbtCompoundTag = NbtTagOf<'compound'>;

/** The numeric types, so a type test reads as one lookup. */
const NUMERIC_TYPES: ReadonlySet<NbtTagType> = new Set(['byte', 'short', 'int', 'long', 'float', 'double']);

/** Whether a tag is one of the six numeric types. */
export const isNumericTag = (tag: NbtTag): tag is NbtNumericTag => NUMERIC_TYPES.has(tag.type);

/** Whether a tag is a list or a typed array. */
export const isCollectionTag = (tag: NbtTag): tag is NbtCollectionTag =>
    tag.type === 'list' || tag.type === 'byte_array' || tag.type === 'int_array' || tag.type === 'long_array';

/**
 * Builds a compound's entries from name and tag pairs.
 *
 * `Object.fromEntries` defines each key as an own property, so `__proto__` becomes an entry
 * rather than replacing the record's prototype, which assigning it would do.
 */
export const compoundOf = (entries: Iterable<readonly [string, NbtTag]>): NbtCompound =>
    Object.freeze(Object.fromEntries(entries));

/** The entry under a name, or undefined when the compound has none. */
export const entryOf = (compound: NbtCompound, key: string): NbtTag | undefined =>
    Object.hasOwn(compound, key) ? compound[key] : undefined;

/** A compound tag over the given entries. */
export const compoundTag = (entries: Iterable<readonly [string, NbtTag]> = []): NbtCompoundTag => ({
    type: 'compound',
    value: compoundOf(entries)
});

/** The empty compound, which is what a command storage nobody wrote to holds. */
export const EMPTY_COMPOUND: NbtCompoundTag = Object.freeze(compoundTag());

/** A list tag over the given elements. */
export const listTag = (elements: readonly NbtTag[]): NbtTagOf<'list'> => ({
    type: 'list',
    value: Object.freeze([...elements])
});

/** A `TAG_Byte`. */
export const byteTag = (value: number): NbtTagOf<'byte'> => ({ type: 'byte', value: wrapSigned(value, 8) });

/** A `TAG_Short`. */
export const shortTag = (value: number): NbtTagOf<'short'> => ({ type: 'short', value: wrapSigned(value, 16) });

/** A `TAG_Int`. */
export const intTag = (value: number): NbtTagOf<'int'> => ({ type: 'int', value: wrapSigned(value, 32) });

/** A `TAG_Long`. */
export const longTag = (value: bigint): NbtTagOf<'long'> => ({ type: 'long', value: BigInt.asIntN(64, value) });

/** A `TAG_Float`, rounded to single precision. */
export const floatTag = (value: number): NbtTagOf<'float'> => ({ type: 'float', value: Math.fround(value) });

/** A `TAG_Double`. */
export const doubleTag = (value: number): NbtTagOf<'double'> => ({ type: 'double', value });

/** A `TAG_String`. */
export const stringTag = (value: string): NbtTagOf<'string'> => ({ type: 'string', value });

/**
 * Truncates toward zero and wraps into a signed integer of the given width, which is what
 * Java's narrowing casts do: `(byte) 200` is `-56`.
 */
const wrapSigned = (value: number, bits: 8 | 16 | 32): number => {
    if (!Number.isFinite(value)) return 0;
    const truncated = Math.trunc(value);
    if (bits === 32) return truncated | 0;
    const shift = 32 - bits;
    return ((truncated | 0) << shift) >> shift;
};

/**
 * A numeric tag's value as a JavaScript number, which is how `/data get` scales it and how a
 * score reads it. A long beyond 2^53 loses precision here, as Java's `getAsDouble` does.
 */
export const numericValueOf = (tag: NbtNumericTag): number => (tag.type === 'long' ? Number(tag.value) : tag.value);

/**
 * How many elements a collection or compound holds, or a string's length: the number
 * `/data get` returns for a tag that is not a number.
 */
export const sizeOf = (tag: NbtTag): number => {
    switch (tag.type) {
        case 'compound':
            return Object.keys(tag.value).length;
        case 'string':
            return tag.value.length;
        case 'list':
        case 'byte_array':
        case 'int_array':
        case 'long_array':
            return tag.value.length;
        default:
            return 0;
    }
};

/**
 * Whether two tags are the same tag: the same type and the same value, compared deeply.
 *
 * `1b` and `1` are different tags, because their types differ, and a compound's key order does
 * not count. Java's `Tag.equals` behaves the same way, and `/data modify … set` uses it to decide
 * whether anything changed.
 */
export const tagsEqual = (left: NbtTag, right: NbtTag): boolean => {
    if (left === right) return true;
    switch (left.type) {
        case 'compound': {
            if (right.type !== 'compound') return false;
            const keys = Object.keys(left.value);
            if (keys.length !== Object.keys(right.value).length) return false;
            return keys.every((key) => {
                const other = entryOf(right.value, key);
                const mine = entryOf(left.value, key);
                return other !== undefined && mine !== undefined && tagsEqual(mine, other);
            });
        }
        case 'list': {
            if (right.type !== 'list' || left.value.length !== right.value.length) return false;
            return left.value.every((element, index) => {
                const other = right.value[index];
                return other !== undefined && tagsEqual(element, other);
            });
        }
        case 'byte_array':
        case 'int_array':
        case 'long_array': {
            if (right.type !== left.type || left.value.length !== right.value.length) return false;
            const theirs = right.value;
            return left.value.every((element, index) => element === theirs[index]);
        }
        default:
            // Two NaN doubles are the same tag, as Java's `Double.equals` holds.
            return (
                right.type === left.type &&
                (right.value === left.value || (Number.isNaN(right.value) && Number.isNaN(left.value)))
            );
    }
};

/**
 * Whether `tag` matches the pattern, the test a path's `{…}` filter and `[{…}]` element filter
 * apply.
 *
 * This is Java's `NbtUtils.compareNbt` with partial lists. A compound pattern matches a compound that
 * holds every entry the pattern names, each one matching in turn. A list pattern matches a list
 * when every element of the pattern matches some element of the list. Any other tag matches
 * only an equal tag. An empty list pattern matches only an empty list.
 */
export const tagMatches = (pattern: NbtTag, tag: NbtTag): boolean => {
    if (pattern.type === 'compound') {
        if (tag.type !== 'compound') return false;
        return Object.keys(pattern.value).every((key) => {
            const wanted = entryOf(pattern.value, key);
            const held = entryOf(tag.value, key);
            return wanted !== undefined && held !== undefined && tagMatches(wanted, held);
        });
    }
    if (pattern.type === 'list') {
        if (tag.type !== 'list') return false;
        if (pattern.value.length === 0) return tag.value.length === 0;
        return pattern.value.every((wanted) => tag.value.some((held) => tagMatches(wanted, held)));
    }
    return tagsEqual(pattern, tag);
};

/**
 * Merges `source` into `target`, the way `/data merge` and `/data modify … merge` do.
 *
 * An entry that is a compound on both sides is merged in turn. Any other entry from `source`
 * replaces the one in `target`. This is Java's `CompoundTag.merge`.
 */
export const mergeCompounds = (target: NbtCompoundTag, source: NbtCompoundTag): NbtCompoundTag => {
    const merged = new Map(Object.entries(target.value));
    for (const [key, incoming] of Object.entries(source.value)) {
        const held = merged.get(key);
        merged.set(
            key,
            held?.type === 'compound' && incoming.type === 'compound' ? mergeCompounds(held, incoming) : incoming
        );
    }
    return compoundTag(merged);
};
