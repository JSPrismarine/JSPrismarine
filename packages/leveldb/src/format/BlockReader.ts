import { ByteReader } from '../util/ByteReader';
import { CorruptionError } from '../Errors';

export interface BlockEntry {
    key: Buffer;
    value: Buffer;
}

/**
 * Reads a decompressed block: the entries, plus the restart array that makes it searchable.
 *
 * @see BlockBuilder for the layout.
 */
export class BlockReader {
    private readonly data: Buffer;
    private readonly restartOffset: number;
    private readonly restartCount: number;

    public constructor(data: Buffer, comparator: (a: Buffer, b: Buffer) => number) {
        if (data.byteLength < 4) throw new CorruptionError('Block is too short to hold a restart count');

        this.data = data;
        this.compare = comparator;
        this.restartCount = data.readUInt32LE(data.byteLength - 4);
        this.restartOffset = data.byteLength - 4 - this.restartCount * 4;

        if (this.restartOffset < 0) {
            throw new CorruptionError(`Block declares ${this.restartCount} restart points it cannot hold`);
        }
    }

    private readonly compare: (a: Buffer, b: Buffer) => number;

    private restartAt(index: number): number {
        return this.data.readUInt32LE(this.restartOffset + index * 4);
    }

    /**
     * Decodes the entry at `offset`, given the key of the entry before it, and reports where the
     * next one starts. `previousKey` supplies the shared prefix this entry left out.
     */
    private decodeAt(offset: number, previousKey: Buffer): { entry: BlockEntry; next: number } {
        const reader = new ByteReader(this.data, offset, this.restartOffset - offset);

        const shared = reader.varint32();
        const nonShared = reader.varint32();
        const valueLength = reader.varint32();

        if (shared > previousKey.byteLength) {
            throw new CorruptionError(`Entry shares ${shared} bytes with a ${previousKey.byteLength} byte key`);
        }

        const keySuffix = reader.bytes(nonShared);
        const key = Buffer.allocUnsafe(shared + nonShared);
        previousKey.copy(key, 0, 0, shared);
        keySuffix.copy(key, shared);

        return { entry: { key, value: reader.bytes(valueLength) }, next: reader.position };
    }

    public *entries(): IterableIterator<BlockEntry> {
        let offset = 0;
        let previousKey: Buffer = Buffer.alloc(0);

        while (offset < this.restartOffset) {
            const { entry, next } = this.decodeAt(offset, previousKey);
            yield entry;
            previousKey = entry.key;
            offset = next;
        }
    }

    /**
     * The first entry whose key is at or after `target`, or null when every key sorts before it.
     *
     * Binary search over the restart points to find the last one that starts at or before the
     * target, then a linear scan forward - the only way to read prefix-compressed entries.
     */
    public seek(target: Buffer): BlockEntry | null {
        let low = 0;
        let high = this.restartCount - 1;

        while (low < high) {
            const middle = Math.ceil((low + high) / 2);
            const offset = this.restartAt(middle);
            // A restart point stores its key in full, so it can be read without any predecessor.
            const { entry } = this.decodeAt(offset, Buffer.alloc(0));

            if (this.compare(entry.key, target) < 0) {
                low = middle;
            } else {
                high = middle - 1;
            }
        }

        if (this.restartCount === 0) return null;

        let offset = this.restartAt(low);
        let previousKey: Buffer = Buffer.alloc(0);

        while (offset < this.restartOffset) {
            const { entry, next } = this.decodeAt(offset, previousKey);
            if (this.compare(entry.key, target) >= 0) return entry;

            previousKey = entry.key;
            offset = next;
        }

        return null;
    }
}

export default BlockReader;
