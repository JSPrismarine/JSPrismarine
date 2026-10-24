import { ContentError } from './errors';

/**
 * A stable reference to one registry entry by key.
 *
 * A holder outlives the build it came from. Reloading content replaces a
 * registry's entries and renumbers them, and every holder for a surviving key
 * then reads the new value and the new id. A holder for a key the new build
 * drops goes unbound instead of going stale.
 */
export interface Holder<T> {
    /** The name of the registry the key belongs to. */
    readonly registry: string;
    /** The key, normally a namespaced identifier such as `minecraft:stone`. */
    readonly key: string;
    /** Whether the current build has an entry under the key. */
    readonly bound: boolean;
    /** The entry's id in the current build, or undefined while unbound. */
    readonly id: number | undefined;
    /** The current value, or undefined while unbound. */
    get(): T | undefined;
    /**
     * The current value.
     *
     * @throws {ContentError} While the holder is unbound.
     */
    value(): T;
}

class RegistryHolder<T> implements Holder<T> {
    public constructor(
        private readonly owner: Registry<T>,
        public readonly key: string
    ) {}

    public get registry(): string {
        return this.owner.name;
    }

    public get bound(): boolean {
        return this.owner.idOf(this.key) !== undefined;
    }

    public get id(): number | undefined {
        return this.owner.idOf(this.key);
    }

    public get(): T | undefined {
        return this.owner.get(this.key);
    }

    public value(): T {
        const id = this.owner.idOf(this.key);
        if (id === undefined) {
            throw new ContentError(`the ${this.owner.name} registry has no entry for ${this.key}`);
        }
        return this.owner.at(id)!;
    }
}

/**
 * A named table of values keyed by namespaced identifier, with a dense numeric
 * id per entry.
 *
 * Ids run from 0 in insertion order and are positional, not persistent: a
 * rebuild that inserts the same keys in the same order reproduces every id, and
 * a rebuild that reorders or drops keys renumbers from 0. Persist keys, not
 * ids, and hold a {@link Holder} rather than an id across a content reload.
 *
 * The built key and value lists are frozen. Nothing writes to a registry except
 * {@link Registry.rebuild}, which replaces the contents whole.
 */
export class Registry<T> implements Iterable<readonly [string, T]> {
    private keyList: readonly string[] = Object.freeze([]);
    private valueList: readonly T[] = Object.freeze([]);
    private ids = new Map<string, number>();
    private readonly holders = new Map<string, RegistryHolder<T>>();
    private builds = 0;

    /** @param name - The registry's name, such as `blocks`; it appears in holders and diagnostics. */
    public constructor(public readonly name: string) {}

    /** How many builds have run, so callers can tell a reload happened. */
    public get generation(): number {
        return this.builds;
    }

    /** How many entries the current build holds. */
    public get size(): number {
        return this.keyList.length;
    }

    /**
     * Replaces every entry. Entries take ids 0 to n-1 in the order the iterable
     * yields them.
     *
     * @throws {ContentError} When one key appears twice in the same build.
     */
    public rebuild(entries: Iterable<readonly [string, T]>): void {
        const keys: string[] = [];
        const values: T[] = [];
        const ids = new Map<string, number>();

        for (const [key, value] of entries) {
            if (ids.has(key)) {
                throw new ContentError(`the ${this.name} registry got ${key} twice in one build`);
            }
            ids.set(key, keys.length);
            keys.push(key);
            values.push(value);
        }

        this.keyList = Object.freeze(keys);
        this.valueList = Object.freeze(values);
        this.ids = ids;
        this.builds += 1;
    }

    /** The value under a key, or undefined when the current build has none. */
    public get(key: string): T | undefined {
        const id = this.ids.get(key);
        return id === undefined ? undefined : this.valueList[id];
    }

    /** The value at an id, or undefined when the id is out of range. */
    public at(id: number): T | undefined {
        return this.valueList[id];
    }

    /** The id of a key in the current build, or undefined when it has no entry. */
    public idOf(key: string): number | undefined {
        return this.ids.get(key);
    }

    /** The key at an id, or undefined when the id is out of range. */
    public keyOf(id: number): string | undefined {
        return this.keyList[id];
    }

    /** Whether the current build has an entry under the key. */
    public has(key: string): boolean {
        return this.ids.has(key);
    }

    /**
     * The holder for a key, created on first ask and reused afterwards, so two
     * calls with the same key return the same object. Asking for a key the
     * current build lacks returns an unbound holder that binds if a later build
     * introduces the key.
     */
    public holder(key: string): Holder<T> {
        const existing = this.holders.get(key);
        if (existing) return existing;

        const created = new RegistryHolder(this, key);
        this.holders.set(key, created);
        return created;
    }

    /** Every key in id order. The array is frozen. */
    public keys(): readonly string[] {
        return this.keyList;
    }

    /** Every value in id order. The array is frozen. */
    public values(): readonly T[] {
        return this.valueList;
    }

    /** Every entry in id order. */
    public *entries(): IterableIterator<readonly [string, T]> {
        for (let id = 0; id < this.keyList.length; id += 1) {
            yield [this.keyList[id]!, this.valueList[id]!] as const;
        }
    }

    /** Iterates the entries in id order. */
    public [Symbol.iterator](): IterableIterator<readonly [string, T]> {
        return this.entries();
    }
}
