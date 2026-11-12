/**
 * A `Set` and a `Map` that report every change, for entity state held in a collection.
 *
 * A mob's tags and status effects are read and written through the standard collection methods
 * by the store and by the legacy code through the store actors, so the collection itself is
 * where a change can be seen.
 * Each mutation that changes the contents calls the observer with the contents before it, in
 * iteration order, and {@link ObservedSet.replace} and {@link ObservedMap.replace} write a saved
 * order back without reporting, which is how the entity store undoes a change.
 */

/** A `Set` that tells its observer the contents before each change. */
export class ObservedSet<T> extends Set<T> {
    /** Called after a change, with the values before it in insertion order. */
    public observer: ((before: readonly T[]) => void) | undefined;

    /** @inheritdoc */
    public override add(value: T): this {
        if (this.has(value)) return this;
        const before = [...this];
        super.add(value);
        this.observer?.(before);
        return this;
    }

    /** @inheritdoc */
    public override delete(value: T): boolean {
        if (!this.has(value)) return false;
        const before = [...this];
        super.delete(value);
        this.observer?.(before);
        return true;
    }

    /** @inheritdoc */
    public override clear(): void {
        if (this.size === 0) return;
        const before = [...this];
        super.clear();
        this.observer?.(before);
    }

    /** Sets the contents to `values`, in that order, without telling the observer. */
    public replace(values: Iterable<T>): void {
        super.clear();
        for (const value of values) super.add(value);
    }
}

/**
 * A `Set` that tells its observer when one of a few watched values comes or goes, and keeps the
 * rest to itself: a body's conditions, of which a client is shown two.
 */
export class WatchedSet<T> extends Set<T> {
    /** Called after a watched value was added or removed, with whether it is present now. */
    public observer: ((value: T, present: boolean) => void) | undefined;
    private readonly watched: ReadonlySet<T>;

    public constructor(watched: Iterable<T>) {
        super();
        this.watched = new Set(watched);
    }

    /** @inheritdoc */
    public override add(value: T): this {
        if (this.has(value)) return this;
        super.add(value);
        if (this.watched.has(value)) this.observer?.(value, true);
        return this;
    }

    /** @inheritdoc */
    public override delete(value: T): boolean {
        if (!super.delete(value)) return false;
        if (this.watched.has(value)) this.observer?.(value, false);
        return true;
    }

    /** @inheritdoc */
    public override clear(): void {
        const gone = [...this].filter((value) => this.watched.has(value));
        super.clear();
        for (const value of gone) this.observer?.(value, false);
    }

    /** Adds or removes one value without telling the observer. */
    public restore(value: T, present: boolean): void {
        if (present) super.add(value);
        else super.delete(value);
    }
}

/** A `Map` that tells its observer the entries before each change. */
export class ObservedMap<K, V> extends Map<K, V> {
    /** Called after a change, with the entries before it in insertion order. */
    public observer: ((before: readonly (readonly [K, V])[]) => void) | undefined;

    /** @inheritdoc */
    public override set(key: K, value: V): this {
        if (this.has(key) && this.get(key) === value) return this;
        const before = [...this];
        super.set(key, value);
        this.observer?.(before);
        return this;
    }

    /** @inheritdoc */
    public override delete(key: K): boolean {
        if (!this.has(key)) return false;
        const before = [...this];
        super.delete(key);
        this.observer?.(before);
        return true;
    }

    /** @inheritdoc */
    public override clear(): void {
        if (this.size === 0) return;
        const before = [...this];
        super.clear();
        this.observer?.(before);
    }

    /** Sets the entries to `entries`, in that order, without telling the observer. */
    public replace(entries: Iterable<readonly [K, V]>): void {
        super.clear();
        for (const [key, value] of entries) super.set(key, value);
    }
}
