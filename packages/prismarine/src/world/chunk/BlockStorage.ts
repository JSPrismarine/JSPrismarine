import type { BlockState } from '../../block/state/BlockState';
import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';

import type BinaryStream from '@jsprismarine/binaryutils';

/** Marks the one decoder path that has exclusive ownership of its index buffer. */
const OWNED_INDICES = Symbol('BlockStorage owned indices');

interface BlockStorageData {
    /** One palette index per block, in XZY order. Copied, so the caller may reuse its buffer. */
    blocks?: ArrayLike<number>;
    palette?: number[];
    [OWNED_INDICES]?: true;
}

/** How many blocks one sub chunk holds. */
const BLOCKS_PER_SUBCHUNK = 4096;
const MAX_BYTE_INDEX_PALETTE_SIZE = 256;

/**
 * The widest palette a `Uint16Array` of indices can address.
 *
 * Far beyond anything a real sub chunk holds - the whole server knows 22079 block states - so
 * reaching it means a decoder has been handed something that is not a sub chunk.
 */
const MAX_PALETTE_SIZE = 65536;

export default class BlockStorage {
    /**
     * One palette index per block, in XZY order.
     *
     * Eight bit indices cover the palettes used by almost every section. The storage widens to
     * sixteen bits when an insertion needs a 257th palette entry.
     */
    private blocks: Uint8Array | Uint16Array;
    private palette: number[];
    private nonAirBlocks: number;
    private readonly airRuntimeId: number;
    private revision = 0;

    /**
     * Where each runtime id sits in {@link palette}.
     *
     * The palette stays an array because `networkSerialize` writes it in order; this is the
     * reverse lookup, so placing a block is one hash lookup rather than the two linear
     * scans - `includes` then `indexOf` - it used to cost. World generation places roughly
     * 18000 blocks per chunk, so that difference is most of the generator's time.
     */
    private readonly paletteIndex: Map<number, number>;

    public constructor({ blocks, palette, [OWNED_INDICES]: ownsIndices }: BlockStorageData) {
        this.airRuntimeId = BlockRuntimeIds.getByName('minecraft:air');
        this.palette = palette ?? [this.airRuntimeId];
        const useByteIndices = this.palette.length <= MAX_BYTE_INDEX_PALETTE_SIZE;
        if (
            ownsIndices &&
            blocks?.length === BLOCKS_PER_SUBCHUNK &&
            ((useByteIndices && blocks instanceof Uint8Array) || (!useByteIndices && blocks instanceof Uint16Array))
        ) {
            this.blocks = blocks;
        } else {
            this.blocks = useByteIndices ? new Uint8Array(BLOCKS_PER_SUBCHUNK) : new Uint16Array(BLOCKS_PER_SUBCHUNK);
            if (blocks) this.blocks.set(blocks);
        }
        this.paletteIndex = new Map(this.palette.map((runtimeId, index) => [runtimeId, index]));

        if (this.palette.length === 1) {
            this.nonAirBlocks = this.palette[0] === this.airRuntimeId ? 0 : BLOCKS_PER_SUBCHUNK;
        } else {
            this.nonAirBlocks = 0;
            for (const index of this.blocks) {
                if (this.palette[index] !== this.airRuntimeId) this.nonAirBlocks++;
            }
        }
    }

    /**
     * Builds a storage from an index buffer that a decoder exclusively owns.
     *
     * @internal The caller must not read or write `blocks` after this call.
     * @param blocks - The 4096 palette slots, in XZY order.
     * @param palette - Runtime ids in the order those slots refer to.
     */
    public static fromOwnedIndices(blocks: Uint8Array | Uint16Array, palette: number[]): BlockStorage {
        return new BlockStorage({ blocks, palette, [OWNED_INDICES]: true });
    }

    private static getIndex(bx: number, by: number, bz: number): number {
        bx = bx & 0x0f;
        bz = bz & 0x0f;
        by = by & 0x0f;
        return ((bx << 8) + (bz << 4)) | by;
    }

    public getBlock(bx: number, by: number, bz: number): BlockState {
        const paletteIndex = this.blocks[BlockStorage.getIndex(bx, by, bz)]!;
        const runtimeId = this.palette[paletteIndex]!;
        const state = BlockRuntimeIds.getState(runtimeId);
        if (!state) {
            throw new Error(`Chunk holds runtime id ${runtimeId}, which no registered block produces`);
        }

        return state;
    }

    /** The number of writes made through this storage's mutable block API. */
    public getRevision(): number {
        return this.revision;
    }

    /**
     * The runtime id at a position, without resolving it to a state.
     *
     * Decoration inspects a great many blocks just to ask "is this stone?", and going
     * through {@link getBlock} would cost a reverse index lookup and a BlockState for each.
     */
    public getRuntimeId(bx: number, by: number, bz: number): number {
        return this.palette[this.blocks[BlockStorage.getIndex(bx, by, bz)]!]!;
    }

    public setBlock(bx: number, by: number, bz: number, runtimeId: number): void {
        const slot = BlockStorage.getIndex(bx, by, bz);
        const previous = this.palette[this.blocks[slot]!]!;
        // Adding the 257th state may replace the byte array, so resolve the slot before indexing it.
        const paletteIndex = this.getOrAddPaletteIndex(runtimeId);
        this.blocks[slot] = paletteIndex;

        if (previous === this.airRuntimeId && runtimeId !== this.airRuntimeId) this.nonAirBlocks++;
        else if (previous !== this.airRuntimeId && runtimeId === this.airRuntimeId) this.nonAirBlocks--;
        this.revision++;
    }

    /**
     * The palette itself, in order. Read only - the disk codec writes one NBT compound per entry
     * and needs them in exactly the order the packed indices refer to.
     */
    public getPalette(): readonly number[] {
        return this.palette;
    }

    /**
     * The palette slot a position holds, rather than the runtime id it resolves to.
     *
     * The disk format stores these indices directly, so going through {@link getRuntimeId} and
     * looking the id back up would be a round trip through the palette for every one of the 4096
     * blocks, and would silently collapse duplicate entries a foreign world happens to contain.
     */
    public getPaletteIndexAt(bx: number, by: number, bz: number): number {
        return this.blocks[BlockStorage.getIndex(bx, by, bz)]!;
    }

    /**
     * Reads a palette slot by its XZY linear index, for internal storage codecs.
     *
     * @internal The index follows the same XZY layout as the persistent format.
     * @param index - The slot in the 4096-entry storage buffer.
     * @returns The palette index at that slot.
     */
    public getPaletteIndexAtIndex(index: number): number {
        return this.blocks[index]!;
    }

    /** The palette slot for a runtime id, appending it if this storage has not seen it. */
    private getOrAddPaletteIndex(runtimeId: number): number {
        const existing = this.paletteIndex.get(runtimeId);
        if (existing !== undefined) return existing;

        if (this.palette.length >= MAX_PALETTE_SIZE) {
            throw new RangeError(`A sub chunk palette holds at most ${MAX_PALETTE_SIZE} entries`);
        }

        if (this.palette.length === MAX_BYTE_INDEX_PALETTE_SIZE && this.blocks instanceof Uint8Array) {
            // Index 256 does not fit in a byte, so widen before publishing the new palette slot.
            const widened = new Uint16Array(BLOCKS_PER_SUBCHUNK);
            widened.set(this.blocks);
            this.blocks = widened;
        }

        const index = this.palette.push(runtimeId) - 1;
        this.paletteIndex.set(runtimeId, index);
        return index;
    }

    /** Writes only palette states used by this section, with zero bits for a uniform section. */
    public networkSerialize(stream: BinaryStream): void {
        const compactIndices = new Uint16Array(BLOCKS_PER_SUBCHUNK);
        const compactPalette: number[] = [];
        const indexByOriginal = new Map<number, number>();

        for (let position = 0; position < BLOCKS_PER_SUBCHUNK; position++) {
            const originalIndex = this.blocks[position]!;
            let compactIndex = indexByOriginal.get(originalIndex);
            if (compactIndex === undefined) {
                const runtimeId = this.palette[originalIndex];
                if (runtimeId === undefined) {
                    throw new RangeError(`Sub chunk block refers to missing palette index ${originalIndex}`);
                }

                compactIndex = compactPalette.length;
                indexByOriginal.set(originalIndex, compactIndex);
                compactPalette.push(runtimeId);
            }

            compactIndices[position] = compactIndex;
        }

        // https://gist.github.com/Tomcc/a96af509e275b1af483b25c543cfbf37
        let bitsPerBlock = Math.ceil(Math.log2(compactPalette.length));

        switch (bitsPerBlock) {
            case 0:
                // Zero-bit storage has one palette entry and no packed words.
                stream.writeByte(1);
                stream.writeVarInt(compactPalette.length);
                for (const runtimeId of compactPalette) stream.writeVarInt(runtimeId);
                return;
            case 1:
            case 2:
            case 3:
            case 4:
            case 5:
            case 6:
                break;
            case 7:
            case 8:
                bitsPerBlock = 8;
                break;
            default:
                bitsPerBlock = 16;
                break;
        }

        // 7 bit: storage type, 1 bit (shift to end): network format (always 1)
        stream.writeByte((bitsPerBlock << 1) | 1);
        const blocksPerWord = Math.floor(32 / bitsPerBlock);
        const wordsPerChunk = Math.ceil(4096 / blocksPerWord);

        // Encoding example
        // https://github.com/NiclasOlofsson/MiNET/blob/4acbccb6dedae066547f8486a2ace1c9d6db0084/src/MiNET/MiNET/Worlds/SubChunk.cs#L294
        let position = 0;
        for (let w = 0; w < wordsPerChunk; w++) {
            let word = 0;
            for (let block = 0; block < blocksPerWord; block++) {
                const state = compactIndices[position++]!;
                word |= state << (bitsPerBlock * block);
            }
            stream.writeIntLE(word);
        }

        // Write palette entries as runtime ids
        stream.writeVarInt(compactPalette.length);
        for (const val of compactPalette) {
            stream.writeVarInt(val);
        }
    }

    public static networkDeserialize(stream: BinaryStream): BlockStorage {
        const bitsPerBlock = stream.readByte() >> 1;
        const blocksPerWord = Math.floor(32 / bitsPerBlock);
        const wordsPerChunk = Math.ceil(4096 / blocksPerWord);

        const words: number[] = new Array(wordsPerChunk);
        for (let w = 0; w < wordsPerChunk; w++) {
            words[w] = stream.readIntLE();
        }

        const paletteCount = stream.readVarInt();
        const palette: number[] = new Array(paletteCount);
        for (let i = 0; i < paletteCount; i++) {
            palette[i] = stream.readVarInt();
        }

        // Encoding example
        // https://github.com/kennyvv/Alex/blob/dcca0d697bbb25637a8bcfa93830f8a762c463af/src/Alex/Worlds/Multiplayer/Bedrock/ChunkProcessor.cs#L367

        let positon = 0;
        const storage = new BlockStorage({ palette });
        for (let w = 0; w < wordsPerChunk; w++) {
            const word = words[w]!;
            for (let block = 0; block < blocksPerWord; block++) {
                const state = (word >> ((positon % blocksPerWord) * bitsPerBlock)) & ((1 << bitsPerBlock) - 1);

                const x = (positon >> 8) & 0xf;
                const y = positon & 0xf;
                const z = (positon >> 4) & 0xf;

                const translated = palette[state]!;
                storage.setBlock(x, y, z, translated);
                positon++;
            }
        }
        return storage;
    }

    public isEmpty(): boolean {
        // Removed states stay in a palette, so count live non-air blocks instead of trusting its size.
        return this.nonAirBlocks === 0;
    }
}
