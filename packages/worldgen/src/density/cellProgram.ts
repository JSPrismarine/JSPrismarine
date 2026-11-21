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

/**
 * The operations of a {@link CellProgram}, one per node. Each fills the node's buffer over the
 * whole cell. The numbers are the program's encoding, which a native interpreter reads too.
 */
export const CellOp = {
    /** `a` is the constant's index. */
    constant: 0,
    /** Copies node `a`: `cache` is value-neutral. */
    copy: 1,
    /**
     * A structure or blending hook: when the context has no hook of kind `a` (0 beardifier, 1
     * blend alpha, 2 blend offset), fills constant `b`, and otherwise runs external sampler `c`.
     */
    hook: 2,
    /** Copies the cell values of external `interpolated` cell `a`. */
    interpolated: 3,
    abs: 4,
    square: 5,
    cube: 6,
    halfNegative: 7,
    quarterNegative: 8,
    negate: 9,
    squeeze: 10,
    /** Clamps node `a` to constants `b` and `c`. */
    clamp: 11,
    add: 12,
    sub: 13,
    /** Multiplies nodes `a` and `b` where one side is a constant: zeros keep their sign. */
    mulConstant: 14,
    /** Multiplies nodes `a` and `b`; a zero left side answers +0 without reading the right. */
    mul: 15,
    min: 16,
    max: 17,
    /**
     * Node `d` where node `a` lies in [constant `b`, constant `c`), and node `e` elsewhere. A
     * branch no position takes is not filled.
     */
    rangeChoice: 18,
    /** Runs external sampler `a` at every position of the cell. */
    fallback: 19
} as const;

/** One of {@link CellOp}'s values. */
export type CellOpCode = (typeof CellOp)[keyof typeof CellOp];

/** The 32-bit words of one node record: the operation, then up to five operands. */
export const CELL_NODE_WORDS = 6;

const UNARY_OPS: Readonly<Record<string, CellOpCode>> = {
    abs: CellOp.abs,
    square: CellOp.square,
    cube: CellOp.cube,
    half_negative: CellOp.halfNegative,
    quarter_negative: CellOp.quarterNegative,
    negate: CellOp.negate,
    squeeze: CellOp.squeeze
};

const HOOK_KINDS = { beardifier: 0, blend_alpha: 1, blend_offset: 2 } as const;

/**
 * A density function tree evaluated one node at a time over a whole cell, as Java 26.3's
 * `sampleVolume` evaluates it over a chunk ([ADR 0028](../../../../docs/adr/0028-density-functions-run-over-volumes.md)).
 *
 * The per-position closures walk the tree once per block. Here the tree is a flat program: one
 * record per distinct node in {@link nodes}, with its operands as node indices or indices into
 * {@link constants}, and one buffer per node in {@link buffers}. An interpreter fills a node's
 * buffer for all the blocks of a cell at once, so the dispatch is paid once per node per cell.
 * Each operation reproduces its closure's arithmetic exactly, so the values are the closures' bit
 * for bit: an `interpolated` node reads the compiler's own cell buffer, filled in Java's volume
 * order, and a node the program has no loop for runs its closure at every position of the cell.
 *
 * Buffers are laid out x-major, then z, then y, the layout of an `interpolated` cell buffer. A
 * program is not reentrant: fill one cell at a time.
 */
export class CellProgram {
    /** Positions in one cell. */
    public readonly size: number;
    /** One {@link CELL_NODE_WORDS}-word record per node; the root is node 0. */
    public readonly nodes: Int32Array;
    /** The constants the records name, as the closures hold them: already rounded to float. */
    public readonly constants: Float64Array;
    /** One buffer of {@link size} values per node, node by node. */
    public readonly buffers: Float64Array;

    private readonly xz: number;
    private readonly y: number;
    private readonly nodeCount: number;
    /** Which fill each node's buffer belongs to, so a node shared in the tree runs once per cell. */
    private readonly filledIn: Int32Array;
    private readonly samplers: DensitySampler[];
    private readonly cells: InterpolatedCell[];
    private fillNumber = 0;
    private context!: SampleContext;
    private x0 = 0;
    private y0 = 0;
    private z0 = 0;
    private fallbacks = 0;

    public constructor(node: DensityFunctionNode, cell: InterpolationCellSize, source: CellProgramSource) {
        this.xz = cell.xz;
        this.y = cell.y;
        this.size = cell.xz * cell.xz * cell.y;
        const builder = new ProgramBuilder(cell, source);
        builder.node(node);
        this.nodes = Int32Array.from(builder.words);
        this.constants = Float64Array.from(builder.constantValues);
        this.samplers = builder.samplers;
        this.cells = builder.cells;
        this.nodeCount = this.nodes.length / CELL_NODE_WORDS;
        this.buffers = new Float64Array(this.nodeCount * this.size);
        this.filledIn = new Int32Array(this.nodeCount).fill(-1);
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
        this.run(0);
        out.set(this.buffers.subarray(0, this.size));
    }

    /** Fills node `index`'s buffer for the current cell, once however often the tree reaches it. */
    private run(index: number): void {
        if (this.filledIn[index] === this.fillNumber) return;
        this.filledIn[index] = this.fillNumber;
        const nodes = this.nodes;
        const record = index * CELL_NODE_WORDS;
        const op = nodes[record] ?? CellOp.fallback;
        const a = nodes[record + 1] ?? 0;
        const b = nodes[record + 2] ?? 0;
        const c = nodes[record + 3] ?? 0;
        const size = this.size;
        const buffers = this.buffers;
        const constants = this.constants;
        const outAt = index * size;

        switch (op) {
            case CellOp.constant:
                buffers.fill(constants[a] ?? 0, outAt, outAt + size);
                return;
            case CellOp.copy:
                this.run(a);
                buffers.copyWithin(outAt, a * size, a * size + size);
                return;
            case CellOp.hook: {
                const context = this.context;
                const hook = a === 0 ? context.beardifier : a === 1 ? context.blendAlpha : context.blendOffset;
                if (hook === undefined) buffers.fill(constants[b] ?? 0, outAt, outAt + size);
                else this.sampleEach(c, outAt);
                return;
            }
            case CellOp.interpolated: {
                const cell = this.cells[a];
                if (cell !== undefined) buffers.set(cell.values(this.context, this.x0, this.y0, this.z0), outAt);
                return;
            }
            case CellOp.fallback:
                this.sampleEach(a, outAt);
                return;
            case CellOp.rangeChoice:
                this.rangeChoice(record, outAt);
                return;
        }

        this.run(a);
        const inAt = a * size;
        switch (op) {
            case CellOp.abs:
                for (let i = 0; i < size; i++) buffers[outAt + i] = Math.abs(buffers[inAt + i] ?? 0);
                return;
            case CellOp.square:
                for (let i = 0; i < size; i++) buffers[outAt + i] = square(buffers[inAt + i] ?? 0);
                return;
            case CellOp.cube:
                for (let i = 0; i < size; i++) buffers[outAt + i] = cube(buffers[inAt + i] ?? 0);
                return;
            case CellOp.halfNegative:
                for (let i = 0; i < size; i++) {
                    const value = buffers[inAt + i] ?? 0;
                    buffers[outAt + i] = value > 0 ? value : f32(value * 0.5);
                }
                return;
            case CellOp.quarterNegative:
                for (let i = 0; i < size; i++) {
                    const value = buffers[inAt + i] ?? 0;
                    buffers[outAt + i] = value > 0 ? value : f32(value * 0.25);
                }
                return;
            case CellOp.negate:
                for (let i = 0; i < size; i++) buffers[outAt + i] = -(buffers[inAt + i] ?? 0);
                return;
            case CellOp.squeeze:
                for (let i = 0; i < size; i++) buffers[outAt + i] = squeeze(buffers[inAt + i] ?? 0);
                return;
            case CellOp.clamp: {
                const min = constants[b] ?? 0;
                const max = constants[c] ?? 0;
                for (let i = 0; i < size; i++) buffers[outAt + i] = clamp(buffers[inAt + i] ?? 0, min, max);
                return;
            }
            case CellOp.mul: {
                // The closure skips the right side where the left is zero, and answers +0.
                let anyNonZero = false;
                for (let i = 0; i < size; i++) {
                    if (buffers[inAt + i] !== 0) {
                        anyNonZero = true;
                        break;
                    }
                }
                if (!anyNonZero) {
                    buffers.fill(0, outAt, outAt + size);
                    return;
                }
                this.run(b);
                const rightAt = b * size;
                for (let i = 0; i < size; i++) {
                    const value = buffers[inAt + i] ?? 0;
                    buffers[outAt + i] = value === 0 ? 0 : f32(value * (buffers[rightAt + i] ?? 0));
                }
                return;
            }
        }

        this.run(b);
        const rightAt = b * size;
        switch (op) {
            case CellOp.add:
                for (let i = 0; i < size; i++) {
                    buffers[outAt + i] = f32((buffers[inAt + i] ?? 0) + (buffers[rightAt + i] ?? 0));
                }
                return;
            case CellOp.sub:
                for (let i = 0; i < size; i++) {
                    buffers[outAt + i] = f32((buffers[inAt + i] ?? 0) - (buffers[rightAt + i] ?? 0));
                }
                return;
            case CellOp.mulConstant:
                for (let i = 0; i < size; i++) {
                    buffers[outAt + i] = f32((buffers[inAt + i] ?? 0) * (buffers[rightAt + i] ?? 0));
                }
                return;
            case CellOp.min:
                for (let i = 0; i < size; i++) {
                    buffers[outAt + i] = Math.min(buffers[inAt + i] ?? 0, buffers[rightAt + i] ?? 0);
                }
                return;
            case CellOp.max:
                for (let i = 0; i < size; i++) {
                    buffers[outAt + i] = Math.max(buffers[inAt + i] ?? 0, buffers[rightAt + i] ?? 0);
                }
                return;
        }
    }

    /**
     * The closure evaluates only the branch a position takes. A branch's value at a position does
     * not depend on the others, so filling it over the whole cell gives the same bits; it is
     * filled only when some position in the cell takes it.
     */
    private rangeChoice(record: number, outAt: number): void {
        const nodes = this.nodes;
        const input = nodes[record + 1] ?? 0;
        const min = this.constants[nodes[record + 2] ?? 0] ?? 0;
        const max = this.constants[nodes[record + 3] ?? 0] ?? 0;
        const inside = nodes[record + 4] ?? 0;
        const outside = nodes[record + 5] ?? 0;
        const size = this.size;
        const buffers = this.buffers;
        this.run(input);
        const inAt = input * size;
        let inRange = 0;
        for (let i = 0; i < size; i++) {
            const value = buffers[inAt + i] ?? 0;
            if (value >= min && value < max) inRange++;
        }
        if (inRange === size || inRange === 0) {
            const taken = inRange === size ? inside : outside;
            this.run(taken);
            buffers.copyWithin(outAt, taken * size, taken * size + size);
            return;
        }
        this.run(inside);
        this.run(outside);
        const insideAt = inside * size;
        const outsideAt = outside * size;
        for (let i = 0; i < size; i++) {
            const value = buffers[inAt + i] ?? 0;
            buffers[outAt + i] =
                value >= min && value < max ? (buffers[insideAt + i] ?? 0) : (buffers[outsideAt + i] ?? 0);
        }
    }

    /** Runs external sampler `sampler` at every block of the cell into the buffer at `outAt`. */
    private sampleEach(sampler: number, outAt: number): void {
        const sample = this.samplers[sampler];
        if (sample === undefined) return;
        const context = this.context;
        const buffers = this.buffers;
        let index = outAt;
        for (let localX = 0; localX < this.xz; localX++) {
            for (let localZ = 0; localZ < this.xz; localZ++) {
                for (let localY = 0; localY < this.y; localY++) {
                    buffers[index++] = sample(context, this.x0 + localX, this.y0 + localY, this.z0 + localZ);
                }
            }
        }
        this.fallbacks += this.size;
    }
}

/** Lays a tree out as {@link CellProgram} records, one per distinct node, root first. */
class ProgramBuilder {
    public readonly words: number[] = [];
    public readonly constantValues: number[] = [];
    public readonly samplers: DensitySampler[] = [];
    public readonly cells: InterpolatedCell[] = [];
    private readonly indices = new Map<DensityFunctionNode, number>();

    public constructor(
        private readonly cell: InterpolationCellSize,
        private readonly source: CellProgramSource
    ) {}

    /** The index of a node's record, laying it out on first sight. */
    public node(node: DensityFunctionNode): number {
        const existing = this.indices.get(node);
        if (existing !== undefined) return existing;
        const index = this.words.length / CELL_NODE_WORDS;
        this.indices.set(node, index);
        // Reserved before the inputs, so a node's index is fixed while its inputs are laid out.
        this.words.push(0, 0, 0, 0, 0, 0);
        this.write(index, this.encode(node));
        return index;
    }

    private write(index: number, record: readonly number[]): void {
        for (let word = 0; word < CELL_NODE_WORDS; word++) {
            this.words[index * CELL_NODE_WORDS + word] = record[word] ?? 0;
        }
    }

    /** A constant's index, rounded to float as the closures round it. */
    private constant(value: number): number {
        this.constantValues.push(f32(value));
        return this.constantValues.length - 1;
    }

    private fallback(node: DensityFunctionNode): number[] {
        this.samplers.push(this.source.sampler(node));
        return [CellOp.fallback, this.samplers.length - 1];
    }

    /** One node's record. Each case is the closure in `compile.ts` applied to every position. */
    private encode(node: DensityFunctionNode): number[] {
        switch (node.type) {
            case 'constant':
                return [CellOp.constant, this.constant(node.value)];
            // Value-neutral: a cache only spares a closure from recomputing its input.
            case 'cache':
                return [CellOp.copy, this.node(node.input)];
            case 'beardifier':
            case 'blend_alpha':
            case 'blend_offset': {
                this.samplers.push(this.source.sampler(node));
                const neutral = node.type === 'blend_alpha' ? 1 : 0;
                return [CellOp.hook, HOOK_KINDS[node.type], this.constant(neutral), this.samplers.length - 1];
            }
            case 'interpolated': {
                const cell = this.source.interpolatedCell(node);
                if (cell === undefined || cell.xz !== this.cell.xz || cell.y !== this.cell.y) {
                    return this.fallback(node);
                }
                this.cells.push(cell);
                return [CellOp.interpolated, this.cells.length - 1];
            }
            case 'abs':
            case 'cube':
            case 'half_negative':
            case 'negate':
            case 'quarter_negative':
            case 'square':
            case 'squeeze':
                return [UNARY_OPS[node.type] ?? CellOp.fallback, this.node(node.input)];
            case 'clamp':
                return [CellOp.clamp, this.node(node.input), this.constant(node.min), this.constant(node.max)];
            case 'add':
            case 'sub':
            case 'mul':
            case 'min':
            case 'max': {
                const left = this.node(node.left);
                const right = this.node(node.right);
                // A constant side changes the arithmetic: a dynamic mul answers +0 for a zero left
                // operand, where multiplying by a constant keeps the sign.
                const constantSide = node.left.type === 'constant' || node.right.type === 'constant';
                const op =
                    node.type === 'mul'
                        ? constantSide
                            ? CellOp.mulConstant
                            : CellOp.mul
                        : node.type === 'add'
                          ? CellOp.add
                          : node.type === 'sub'
                            ? CellOp.sub
                            : node.type === 'min'
                              ? CellOp.min
                              : CellOp.max;
                return [op, left, right];
            }
            // Vanilla's density functions never divide by a dynamic value above an interpolated node.
            case 'div':
                return this.fallback(node);
            case 'range_choice':
                return [
                    CellOp.rangeChoice,
                    this.node(node.input),
                    this.constant(node.minInclusive),
                    this.constant(node.maxExclusive),
                    this.node(node.whenInRange),
                    this.node(node.whenOutOfRange)
                ];
            default:
                return this.fallback(node);
        }
    }
}
