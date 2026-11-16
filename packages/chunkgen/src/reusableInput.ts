/**
 * Parts of a generation task's input that a generation host keeps for later tasks.
 *
 * A feature task carries the nine terrain tiles around its chunk, about 1.8 MB, and its
 * neighbors carry six of the same nine. Through a host process every copy is serialized on the
 * server thread and parsed again by the host. A part wrapped with {@link reusableInput} is sent
 * once under its key; a later task names the key, and the host puts back the value it kept.
 *
 * A marker sits at the top level of a task's input, as a property's value or as an element of an
 * array that is one. Nothing deeper is looked at, so finding the markers costs a pass over the
 * input's own fields rather than over everything they hold.
 *
 * The value under a key must not change: a host that holds the key answers with what it was sent
 * first.
 */

/** A part of a task's input that may be sent once and named after that. */
export class ReusableInput {
    /**
     * @param key - Names the value for as long as either side remembers it.
     * @param value - What the worker receives in the marker's place.
     */
    public constructor(
        public readonly key: string,
        public readonly value: unknown
    ) {}
}

/** Wraps a part of a task's input that later tasks may carry again. */
export const reusableInput = (key: string, value: unknown): ReusableInput => new ReusableInput(key, value);

/**
 * Where a marker sat in an encoded input, and what goes back there.
 *
 * Slots travel beside the input rather than inside it, so no value of the input itself can be
 * read as one.
 */
export type ReusableSlot = {
    /** The top-level field that held the marker. */
    readonly field: string;
    /** The marker's position when the field is an array. */
    readonly index?: number;
    /** The key the value is kept under. */
    readonly key: string;
} & ({ readonly sent: true; readonly value: unknown } | { readonly sent: false });

/** An input with its markers taken out, and the slots that say what goes back in. */
export interface EncodedReusable {
    readonly input: Readonly<Record<string, unknown>>;
    readonly slots: readonly ReusableSlot[];
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;

/** Applies `replace` to each top-level field of an input and each element of a top-level array. */
const mapTopLevel = (
    input: Record<string, unknown>,
    replace: (value: unknown, field: string, index?: number) => unknown
): Record<string, unknown> => {
    const each = (value: unknown, field: string): unknown =>
        Array.isArray(value) ? value.map((element, index) => replace(element, field, index)) : replace(value, field);
    return Object.fromEntries(Object.entries(input).map(([field, value]) => [field, each(value, field)]));
};

/** Whether an input holds a marker where markers may sit. */
const hasMarkers = (input: unknown): input is Record<string, unknown> =>
    isPlainObject(input) &&
    Object.values(input).some(
        (value) =>
            value instanceof ReusableInput ||
            (Array.isArray(value) && value.some((element) => element instanceof ReusableInput))
    );

/** Replaces each marker with its value, for a runner that keeps nothing between tasks. */
export const unwrapReusable = (input: unknown): unknown =>
    hasMarkers(input) ? mapTopLevel(input, (value) => (value instanceof ReusableInput ? value.value : value)) : input;

/**
 * Keys in least recently used order, bounded by a count.
 *
 * The server and the host each keep one, and both apply the same puts and uses in the same order,
 * since the host reads the channel in the order the server writes it. So the server knows which
 * keys the host still holds without asking.
 */
export class ReusableCache<Value> {
    private readonly entries = new Map<string, { readonly value: Value }>();

    public constructor(private readonly capacity: number) {}

    /**
     * The entry under a key, which becomes the most recently used. The entry wraps the value, so a
     * key kept with `undefined` still reads as present.
     */
    public use(key: string): { readonly value: Value } | undefined {
        const entry = this.entries.get(key);
        if (entry === undefined) return undefined;
        this.entries.delete(key);
        this.entries.set(key, entry);
        return entry;
    }

    /** Keeps a value under a key, dropping the least recently used beyond the capacity. */
    public put(key: string, value: Value): void {
        this.entries.delete(key);
        this.entries.set(key, { value });
        while (this.entries.size > this.capacity) {
            const oldest = this.entries.keys().next();
            if (oldest.done === true) break;
            this.entries.delete(oldest.value);
        }
    }

    /** Forgets everything, as a replacement host starts with nothing. */
    public clear(): void {
        this.entries.clear();
    }
}

/** How many reusable values a host keeps. A terrain tile is about 250 KB. */
export const REUSABLE_CAPACITY = 384;

/**
 * Encodes an input for the host: each marker leaves the input for a slot, which carries its value
 * when the host does not hold its key and only the key when it does.
 * @param held - The server's record of what the host holds, updated as the host's will be.
 * @returns `undefined` for an input without markers, which goes to the host as it is.
 */
export const encodeReusable = (input: unknown, held: ReusableCache<true>): EncodedReusable | undefined => {
    if (!hasMarkers(input)) return undefined;
    const slots: ReusableSlot[] = [];
    const stripped = mapTopLevel(input, (value, field, index) => {
        if (!(value instanceof ReusableInput)) return value;
        const at = { field, ...(index === undefined ? {} : { index }), key: value.key };
        if (held.use(value.key) !== undefined) {
            slots.push({ ...at, sent: false });
        } else {
            held.put(value.key, true);
            slots.push({ ...at, sent: true, value: value.value });
        }
        return null;
    });
    return { input: stripped, slots };
};

/** A reference to a value the host does not hold, which the server answers by sending it. */
export class ReusableMissError extends Error {
    public constructor(key: string) {
        super(`The generation host holds no reusable input ${key}`);
        this.name = 'ReusableMissError';
    }
}

/**
 * Decodes an input on the host: keeps each value a slot carries and puts back each one a slot names.
 * @throws ReusableMissError when a slot names a key the host does not hold.
 */
export const decodeReusable = (
    input: unknown,
    slots: readonly ReusableSlot[],
    kept: ReusableCache<unknown>
): Record<string, unknown> => {
    if (!isPlainObject(input)) throw new TypeError('An encoded reusable input is a plain object');
    const decoded = { ...input };
    const copied = new Set<string>();
    const missing: string[] = [];
    for (const slot of slots) {
        let value: unknown;
        if (slot.sent) {
            kept.put(slot.key, slot.value);
            value = slot.value;
        } else {
            const found = kept.use(slot.key);
            if (found === undefined) missing.push(slot.key);
            value = found?.value;
        }
        if (slot.index === undefined) {
            decoded[slot.field] = value;
            continue;
        }
        const array = decoded[slot.field];
        if (!Array.isArray(array)) throw new TypeError(`Reusable slot field ${slot.field} is not an array`);
        const target = copied.has(slot.field) ? array : [...array];
        copied.add(slot.field);
        target[slot.index] = value;
        decoded[slot.field] = target;
    }
    if (missing.length > 0) throw new ReusableMissError(missing.join(', '));
    return decoded;
};
