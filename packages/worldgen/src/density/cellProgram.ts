import { clamp, f32 } from '../math';
import { cube, square, squeeze } from './arithmetic';
import type { DensitySampler, InterpolatedCell, InterpolationCellSize } from './compile';
import type { DensityFunctionNode } from './DensityFunction';
import type { SampleContext } from './SampleContext';

/** What a {@link CellProgram} needs from the compiler that built it. */
export interface CellProgramSource {
    /** The per-position closure for a node, used for the nodes the program has no loop for. */
    sampler(node: DensityFunctionNode): DensitySampler;
    /** The whole-cell values of an `interpolated` node, when the compiler buffers its cells. */
    interpolatedCell(node: DensityFunctionNode): InterpolatedCell | undefined;
}

/** Fills one node's values over the current cell and returns them. */
type Step = () => Float64Array;

/**
 * A density function tree evaluated one node at a time over a whole cell, as Java 26.3's
 * `sampleVolume` evaluates it over a chunk ([ADR 0028](../../../../docs/adr/0028-density-functions-run-over-volumes.md)).
 *
 * The per-position closures walk the tree once per block. Here every node is one step that fills
 * a buffer for all the blocks of a cell at once, so the dispatch is paid once per node per cell.
 * Each step reproduces its closure's arithmetic exactly, so the values are the closures' bit for
 * bit: an `interpolated` node reads the compiler's own cell buffer, filled in Java's volume order,
 * and a node the program has no loop for runs its closure at every position of the cell.
 *
 * Buffers are laid out x-major, then z, then y, the layout of an `interpolated` cell buffer. A
 * program holds one buffer per node and is not reentrant: fill one cell at a time.
 */
export class CellProgram {
    /** Positions in one cell. */
    public readonly size: number;

    private readonly root: Step;
    private readonly xz: number;
    private readonly y: number;
    private readonly steps = new Map<DensityFunctionNode, Step>();
    /** Which fill each step's buffer belongs to, so a node shared in the tree runs once per cell. */
    private fillNumber = 0;
    private context!: SampleContext;
    private x0 = 0;
    private y0 = 0;
    private z0 = 0;
    private fallbacks = 0;

    public constructor(
        node: DensityFunctionNode,
        cell: InterpolationCellSize,
        private readonly source: CellProgramSource
    ) {
        this.xz = cell.xz;
        this.y = cell.y;
        this.size = cell.xz * cell.xz * cell.y;
        this.root = this.step(node);
    }

    /** How many cells the program has filled. */
    public get fills(): number {
        return this.fillNumber;
    }

    /**
     * How many positions ran a node's per-position closure because the program has no loop for
     * it, over every fill so far. Vanilla's `final_density` runs none.
     */
    public get fallbackSamples(): number {
        return this.fallbacks;
    }

    /**
     * Fills `out` with the tree's value at every block of the cell whose minimum corner is
     * (`x0`, `y0`, `z0`), at index `(localX * xz + localZ) * y + localY`.
     */
    public fill(context: SampleContext, x0: number, y0: number, z0: number, out: Float64Array): void {
        this.fillNumber++;
        this.context = context;
        this.x0 = x0;
        this.y0 = y0;
        this.z0 = z0;
        out.set(this.root());
    }

    /** The step for a node, built once however often the tree reaches it. */
    private step(node: DensityFunctionNode): Step {
        const existing = this.steps.get(node);
        if (existing !== undefined) return existing;
        const fill = this.build(node);
        const buffer = new Float64Array(this.size);
        let filledIn = -1;
        const step: Step = () => {
            if (filledIn !== this.fillNumber) {
                fill(buffer);
                filledIn = this.fillNumber;
            }
            return buffer;
        };
        this.steps.set(node, step);
        return step;
    }

    /** What fills a node's buffer. Each case is the closure in `compile.ts` applied to every position. */
    private build(node: DensityFunctionNode): (out: Float64Array) => void {
        const size = this.size;
        switch (node.type) {
            case 'constant': {
                const value = f32(node.value);
                return (out) => out.fill(value);
            }

            // Value-neutral: a cache only spares a closure from recomputing its input.
            case 'cache': {
                const input = this.step(node.input);
                return (out) => out.set(input());
            }

            case 'beardifier':
            case 'blend_alpha':
            case 'blend_offset': {
                const type = node.type;
                const neutral = type === 'blend_alpha' ? 1 : 0;
                const fallback = this.fallback(node);
                return (out) => {
                    const hook =
                        type === 'beardifier'
                            ? this.context.beardifier
                            : type === 'blend_alpha'
                              ? this.context.blendAlpha
                              : this.context.blendOffset;
                    if (hook === undefined) out.fill(neutral);
                    else fallback(out);
                };
            }

            case 'interpolated': {
                const cell = this.source.interpolatedCell(node);
                if (cell === undefined || cell.xz !== this.xz || cell.y !== this.y) return this.fallback(node);
                return (out) => out.set(cell.values(this.context, this.x0, this.y0, this.z0));
            }

            case 'abs':
            case 'cube':
            case 'half_negative':
            case 'negate':
            case 'quarter_negative':
            case 'square':
            case 'squeeze': {
                const type = node.type;
                const input = this.step(node.input);
                return (out) => {
                    const values = input();
                    switch (type) {
                        case 'abs':
                            for (let index = 0; index < size; index++) out[index] = Math.abs(values[index] ?? 0);
                            return;
                        case 'square':
                            for (let index = 0; index < size; index++) out[index] = square(values[index] ?? 0);
                            return;
                        case 'cube':
                            for (let index = 0; index < size; index++) out[index] = cube(values[index] ?? 0);
                            return;
                        case 'half_negative':
                            for (let index = 0; index < size; index++) {
                                const value = values[index] ?? 0;
                                out[index] = value > 0 ? value : f32(value * 0.5);
                            }
                            return;
                        case 'quarter_negative':
                            for (let index = 0; index < size; index++) {
                                const value = values[index] ?? 0;
                                out[index] = value > 0 ? value : f32(value * 0.25);
                            }
                            return;
                        case 'negate':
                            for (let index = 0; index < size; index++) out[index] = -(values[index] ?? 0);
                            return;
                        case 'squeeze':
                            for (let index = 0; index < size; index++) out[index] = squeeze(values[index] ?? 0);
                            return;
                    }
                };
            }

            case 'clamp': {
                const input = this.step(node.input);
                const min = f32(node.min);
                const max = f32(node.max);
                return (out) => {
                    const values = input();
                    for (let index = 0; index < size; index++) out[index] = clamp(values[index] ?? 0, min, max);
                };
            }

            case 'add':
            case 'sub':
            case 'mul':
            case 'div':
            case 'min':
            case 'max':
                return this.buildBinary(node);

            case 'range_choice': {
                const input = this.step(node.input);
                const whenInRange = this.step(node.whenInRange);
                const whenOutOfRange = this.step(node.whenOutOfRange);
                const min = f32(node.minInclusive);
                const max = f32(node.maxExclusive);
                // The closure evaluates only the branch a position takes. A branch's value at a
                // position does not depend on the others, so filling it over the whole cell gives
                // the same bits; it is filled only when some position in the cell takes it.
                return (out) => {
                    const values = input();
                    let inRange = 0;
                    for (let index = 0; index < size; index++) {
                        const value = values[index] ?? 0;
                        if (value >= min && value < max) inRange++;
                    }
                    if (inRange === size) {
                        out.set(whenInRange());
                        return;
                    }
                    if (inRange === 0) {
                        out.set(whenOutOfRange());
                        return;
                    }
                    const inside = whenInRange();
                    const outside = whenOutOfRange();
                    for (let index = 0; index < size; index++) {
                        const value = values[index] ?? 0;
                        out[index] = value >= min && value < max ? (inside[index] ?? 0) : (outside[index] ?? 0);
                    }
                };
            }

            default:
                return this.fallback(node);
        }
    }

    /**
     * Each binary operator, in the variant `compile.ts`'s `buildBinary` picks: a constant side
     * changes the arithmetic, since a dynamic `mul` returns +0 for a zero left operand where
     * multiplying by a constant keeps the sign.
     */
    private buildBinary(
        node: DensityFunctionNode & { type: 'add' | 'sub' | 'mul' | 'div' | 'min' | 'max' }
    ): (out: Float64Array) => void {
        // Vanilla's density functions never divide by a dynamic value above an interpolated node.
        if (node.type === 'div') return this.fallback(node);
        const size = this.size;
        const leftConstant = node.left.type === 'constant' ? f32(node.left.value) : undefined;
        const rightConstant = node.right.type === 'constant' ? f32(node.right.value) : undefined;
        const left = this.step(node.left);
        const right = this.step(node.right);

        switch (node.type) {
            case 'add':
                return (out) => {
                    const a = left();
                    const b = right();
                    for (let index = 0; index < size; index++) out[index] = f32((a[index] ?? 0) + (b[index] ?? 0));
                };
            case 'sub':
                return (out) => {
                    const a = left();
                    const b = right();
                    for (let index = 0; index < size; index++) out[index] = f32((a[index] ?? 0) - (b[index] ?? 0));
                };
            case 'mul':
                if (leftConstant !== undefined || rightConstant !== undefined) {
                    return (out) => {
                        const a = left();
                        const b = right();
                        for (let index = 0; index < size; index++) out[index] = f32((a[index] ?? 0) * (b[index] ?? 0));
                    };
                }
                return (out) => {
                    const a = left();
                    // The closure skips the right side where the left is zero, and answers +0.
                    let anyNonZero = false;
                    for (let index = 0; index < size; index++) {
                        if (a[index] !== 0) {
                            anyNonZero = true;
                            break;
                        }
                    }
                    if (!anyNonZero) {
                        out.fill(0);
                        return;
                    }
                    const b = right();
                    for (let index = 0; index < size; index++) {
                        const value = a[index] ?? 0;
                        out[index] = value === 0 ? 0 : f32(value * (b[index] ?? 0));
                    }
                };
            case 'min':
                return (out) => {
                    const a = left();
                    const b = right();
                    for (let index = 0; index < size; index++) out[index] = Math.min(a[index] ?? 0, b[index] ?? 0);
                };
            case 'max':
                return (out) => {
                    const a = left();
                    const b = right();
                    for (let index = 0; index < size; index++) out[index] = Math.max(a[index] ?? 0, b[index] ?? 0);
                };
        }
    }

    /** Runs a node's per-position closure at every block of the cell. */
    private fallback(node: DensityFunctionNode): (out: Float64Array) => void {
        const sample = this.source.sampler(node);
        const xz = this.xz;
        const height = this.y;
        return (out) => {
            const context = this.context;
            let index = 0;
            for (let localX = 0; localX < xz; localX++) {
                for (let localZ = 0; localZ < xz; localZ++) {
                    for (let localY = 0; localY < height; localY++) {
                        out[index++] = sample(context, this.x0 + localX, this.y0 + localY, this.z0 + localZ);
                    }
                }
            }
            this.fallbacks += this.size;
        };
    }
}
