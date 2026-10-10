import { sharedPrefixLength } from '../util/Comparator';
import { ByteWriter } from '../util/ByteWriter';

/**
 * Builds one block: a run of entries, then the restart array, then the restart count.
 *
 * Keys inside a block are sorted, so consecutive keys usually share a prefix and an entry stores
 * only the part that differs. That would make the block unsearchable, so every `restartInterval`
 * entries one is written in full - a restart point - and the offsets of those are listed at the
 * end. A lookup binary-searches the restart array, then decodes forward from there.
 */
export class BlockBuilder {
    private readonly writer = new ByteWriter(4096);
    private readonly restarts: number[] = [0];
    private readonly restartInterval: number;

    private lastKey: Buffer = Buffer.alloc(0);
    private sinceRestart = 0;
    private finished = false;

    public constructor(restartInterval = 16) {
        this.restartInterval = Math.max(1, restartInterval);
    }

    public get empty(): boolean {
        return this.writer.length === 0;
    }

    /** What the block would occupy if finished now, which is how a table decides to flush it. */
    public get estimatedSize(): number {
        return this.writer.length + this.restarts.length * 4 + 4;
    }

    /** Keys must arrive in ascending order; a block whose keys are unsorted is unsearchable. */
    public add(key: Buffer, value: Buffer): void {
        if (this.finished) throw new Error('Cannot add to a finished block');

        let shared = 0;
        if (this.sinceRestart < this.restartInterval) {
            shared = sharedPrefixLength(this.lastKey, key);
        } else {
            this.restarts.push(this.writer.length);
            this.sinceRestart = 0;
        }

        this.writer
            .varint32(shared)
            .varint32(key.byteLength - shared)
            .varint32(value.byteLength)
            .bytes(key.subarray(shared))
            .bytes(value);

        this.lastKey = Buffer.from(key);
        this.sinceRestart++;
    }

    public finish(): Buffer {
        this.finished = true;
        for (const restart of this.restarts) this.writer.u32(restart);
        this.writer.u32(this.restarts.length);
        return this.writer.finish();
    }

    public reset(): void {
        this.writer.reset();
        this.restarts.length = 0;
        this.restarts.push(0);
        this.lastKey = Buffer.alloc(0);
        this.sinceRestart = 0;
        this.finished = false;
    }
}

export default BlockBuilder;
