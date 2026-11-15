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

/** A value sent to the host to keep under its key. */
interface ReusablePut {
    readonly __reusablePut: string;
    readonly value: unknown;
}

/** A key whose value the host was sent before. */
interface ReusableRef {
    readonly __reusableRef: string;
}

const isPut = (value: unknown): value is ReusablePut =>
    typeof value === 'object' && value !== null && '__reusablePut' in value && typeof value.__reusablePut === 'string';

const isRef = (value: unknown): value is ReusableRef =>
    typeof value === 'object' && value !== null && '__reusableRef' in value && typeof value.__reusableRef === 'string';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;

/** Applies `replace` to each top-level field of an input and each element of a top-level array. */
const mapTopLevel = (input: unknown, replace: (value: unknown) => unknown): unknown => {
    if (!isPlainObject(input)) return input;
    const each = (value: unknown): unknown => (Array.isArray(value) ? value.map(replace) : replace(value));
    return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, each(value)]));
};

/** Whether an input holds a marker where markers may sit. */
const hasMarkers = (input: unknown): boolean =>
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
    private readonly entries = new Map<string, Value>();

    public constructor(private readonly capacity: number) {}

    /** The value under a key, which becomes the most recently used. */
    public use(key: string): Value | undefined {
        const value = this.entries.get(key);
        if (value === undefined) return undefined;
        this.entries.delete(key);
        this.entries.set(key, value);
        return value;
    }

    /** Keeps a value under a key, dropping the least recently used beyond the capacity. */
    public put(key: string, value: Value): void {
        this.entries.delete(key);
        this.entries.set(key, value);
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
 * Encodes an input for the host: a marker whose key the host holds becomes a reference, and any
 * other is sent with its value, which the host then keeps.
 * @param held - The server's record of what the host holds, updated as the host's will be.
 */
export const encodeReusable = (input: unknown, held: ReusableCache<true>): unknown =>
    hasMarkers(input)
        ? mapTopLevel(input, (value) => {
              if (!(value instanceof ReusableInput)) return value;
              if (held.use(value.key) !== undefined) return { __reusableRef: value.key } satisfies ReusableRef;
              held.put(value.key, true);
              return { __reusablePut: value.key, value: value.value } satisfies ReusablePut;
          })
        : input;

/** A reference to a value the host does not hold, which the server answers by sending it. */
export class ReusableMissError extends Error {
    public constructor(key: string) {
        super(`The generation host holds no reusable input ${key}`);
        this.name = 'ReusableMissError';
    }
}

/**
 * Decodes an input on the host: keeps each value sent with a key and puts back each one referred to.
 * @throws ReusableMissError when a reference names a key the host does not hold.
 */
export const decodeReusable = (input: unknown, kept: ReusableCache<unknown>): unknown => {
    const isWire = (value: unknown): boolean => isPut(value) || isRef(value);
    if (
        !isPlainObject(input) ||
        !Object.values(input).some((value) => isWire(value) || (Array.isArray(value) && value.some(isWire)))
    ) {
        return input;
    }
    const missing: string[] = [];
    const decoded = mapTopLevel(input, (value) => {
        if (isPut(value)) {
            kept.put(value.__reusablePut, value.value);
            return value.value;
        }
        if (isRef(value)) {
            const found = kept.use(value.__reusableRef);
            if (found === undefined) missing.push(value.__reusableRef);
            return found;
        }
        return value;
    });
    if (missing.length > 0) throw new ReusableMissError(missing.join(', '));
    return decoded;
};
