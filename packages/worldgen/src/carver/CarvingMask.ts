import type { WorldGenerationContext } from '../surface/VerticalAnchor';

/** How many blocks below the build ceiling a carver is not allowed to touch. */
const PROTECTED_BLOCKS_ON_TOP = 7;

/** Where a carver writes its openings. */
export interface CarverOutput {
    /** The lowest y the carver may open. */
    readonly minY: number;
    /** The highest y the carver may open. */
    readonly maxY: number;
    /** Opens one block, addressed by its position inside the chunk. */
    carve(localX: number, y: number, localZ: number): void;
}

/** Reports one run of open blocks in a column. */
export type CarvingMaskVisitor = (localX: number, localZ: number, bottomY: number, topY: number) => void;

/**
 * The set of blocks a chunk's carvers opened, before anything is removed from the chunk.
 *
 * Java separates the two steps so that one pass over 289 source chunks can accumulate every
 * carver's openings and the chunk is then edited once. {@link visit} walks the result as
 * vertical runs, which is the order the edit wants.
 */
export class CarvingMask implements CarverOutput {
    /** @inheritDoc */
    public readonly minY: number;
    /** @inheritDoc */
    public readonly maxY: number;

    private readonly height: number;
    private readonly bits: Uint8Array;

    public constructor(minY: number, maxY: number) {
        this.minY = minY;
        this.maxY = maxY;
        this.height = maxY - minY + 1;
        this.bits = new Uint8Array(256 * this.height);
    }

    /**
     * Builds the mask a chunk generator uses, which spans the dimension minus one block at the
     * bottom and seven at the top.
     */
    public static forChunk(context: WorldGenerationContext): CarvingMask {
        return new CarvingMask(context.minGenY + 1, context.minGenY + context.genDepth - 1 - PROTECTED_BLOCKS_ON_TOP);
    }

    /** @inheritDoc */
    public carve(localX: number, y: number, localZ: number): void {
        this.bits[this.indexOf(localX, y, localZ)] = 1;
    }

    /** Whether one block is open. */
    public isCarved(localX: number, y: number, localZ: number): boolean {
        return this.bits[this.indexOf(localX, y, localZ)] === 1;
    }

    /** How many blocks the mask opened, which is the volume a distribution check measures. */
    public get carvedCount(): number {
        let total = 0;
        for (const bit of this.bits) total += bit;
        return total;
    }

    /** Whether nothing was opened. */
    public isEmpty(): boolean {
        return this.carvedCount === 0;
    }

    /** Reports every run of open blocks, column by column, lowest index first. */
    public visit(visitor: CarvingMaskVisitor): void {
        let start = this.nextSetBit(0);
        while (start !== -1) {
            const end = this.nextClearBit(start) - 1;
            this.visitSegment(visitor, start, end);
            start = this.nextSetBit(end + 1);
        }
    }

    private visitSegment(visitor: CarvingMaskVisitor, startIndex: number, endIndex: number): void {
        const startColumn = Math.trunc(startIndex / this.height);
        const endColumn = Math.trunc(endIndex / this.height);
        for (let column = startColumn; column <= endColumn; column++) {
            const base = column * this.height;
            visitor(
                (column >> 4) & 15,
                column & 15,
                Math.max(startIndex - base, 0) + this.minY,
                Math.min(endIndex - base, this.height - 1) + this.minY
            );
        }
    }

    private indexOf(localX: number, y: number, localZ: number): number {
        return y - this.minY + (localZ + (localX << 4)) * this.height;
    }

    private nextSetBit(from: number): number {
        for (let index = from; index < this.bits.length; index++) {
            if (this.bits[index] === 1) return index;
        }
        return -1;
    }

    private nextClearBit(from: number): number {
        for (let index = from; index < this.bits.length; index++) {
            if (this.bits[index] === 0) return index;
        }
        return this.bits.length;
    }
}
