import { WriteBatch } from '@jsprismarine/leveldb';

/** One key's last write in an {@link OverlayBatch}. */
interface OverlayWrite {
    readonly key: Buffer;
    /** Null for a deletion. */
    readonly value: Buffer | null;
    /** What the write adds to `WriteBatch.approximateSize`. */
    readonly bytes: number;
}

/**
 * Writes that have not reached the database yet, which a read looks up before it asks the
 * database (ADR 0018).
 *
 * A later write to a key replaces the earlier one and moves to the end, so the batch it becomes
 * holds each key once, in the order of each key's last write.
 */
export class OverlayBatch {
    /** By the key's bytes as latin1, which maps each byte to one character. */
    private readonly writes = new Map<string, OverlayWrite>();
    private bytes = 0;

    /** Writes `value` to `key`, replacing an earlier write to it. */
    public put(key: Buffer, value: Buffer): this {
        this.set({ key, value, bytes: new WriteBatch().put(key, value).approximateSize });
        return this;
    }

    /** Deletes `key`, replacing an earlier write to it. */
    public del(key: Buffer): this {
        this.set({ key, value: null, bytes: new WriteBatch().del(key).approximateSize });
        return this;
    }

    /**
     * What this batch wrote to `key`.
     * @returns The value, null for a deletion, or undefined when the batch has not written the key.
     */
    public lookup(key: Buffer): Buffer | null | undefined {
        return this.writes.get(key.toString('latin1'))?.value;
    }

    /** Keys written. */
    public get count(): number {
        return this.writes.size;
    }

    /** What `WriteBatch.approximateSize` would say for these writes. */
    public get approximateSize(): number {
        return this.bytes;
    }

    /** Every key's last write, in the order those writes were made. */
    public entries(): IterableIterator<{ readonly key: Buffer; readonly value: Buffer | null }> {
        return this.writes.values();
    }

    /** Writes each of `other`'s writes here after this batch's own, so `other` wins a shared key. */
    public append(other: OverlayBatch): this {
        for (const write of other.writes.values()) this.set(write);
        return this;
    }

    /** The batch the database writes. */
    public toWriteBatch(): WriteBatch {
        const batch = new WriteBatch();
        for (const { key, value } of this.writes.values()) {
            if (value === null) batch.del(key);
            else batch.put(key, value);
        }
        return batch;
    }

    private set(write: OverlayWrite): void {
        const id = write.key.toString('latin1');
        const previous = this.writes.get(id);
        if (previous !== undefined) {
            this.bytes -= previous.bytes;
            // Deleted first so the key moves to the end, where its latest write belongs.
            this.writes.delete(id);
        }
        this.writes.set(id, write);
        this.bytes += write.bytes;
    }
}
