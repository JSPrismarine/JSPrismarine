import { bindNative } from '@jsprismarine/native-library/ffi';
import type { BoundNative, FfiSignature } from '@jsprismarine/native-library/ffi';
import { NativeLibraryError } from '@jsprismarine/errors/native-library';
import { NativeWorldgenErrors } from '@jsprismarine/errors/native-worldgen';

import { locateLibrary } from './library';

/** The interface version this binding speaks; it must equal the library's `JWG_ABI_VERSION`. */
export const ABI_VERSION = 1;

/** The doubles each layer takes in the parameters `jwg_stack_create` reads. */
const LAYER_PARAMS = 6;

/** The C interface (`native/include/jsp_native_worldgen.h`), one method per exported function. */
interface NativeSymbols {
    jwg_abi_version(): number;
    jwg_stack_create(perms: Uint8Array, params: Float64Array, count: number): number;
    jwg_stack_destroy(handle: number): void;
    jwg_stack_get3(handle: number, x: number, y: number, z: number): number;
    jwg_stack_fill(handle: number, xyz: Float64Array, out: Float64Array, count: number): void;
    jwg_program_create(
        nodes: Int32Array,
        nodeCount: number,
        constants: Float64Array,
        constantCount: number,
        links: Int32Array,
        linkCount: number,
        stacks: Float64Array,
        stackCount: number,
        cacheSlots: number
    ): number;
    jwg_program_destroy(handle: number): void;
    jwg_program_eval(handle: number, x: number, y: number, z: number): number;
    jwg_climate_create(
        bounds: Float64Array,
        childStarts: Uint32Array,
        childCounts: Uint32Array,
        valueIndices: Int32Array,
        firstLeafRanks: Uint32Array,
        nodeCount: number,
        children: Uint32Array,
        childTotal: number,
        maxDepth: number
    ): number;
    jwg_climate_destroy(handle: number): void;
    jwg_climate_find(
        handle: number,
        candidate: number,
        temperature: number,
        humidity: number,
        continentalness: number,
        erosion: number,
        depth: number,
        weirdness: number
    ): number;
    jwg_biome_jitter(seedHi: number, seedLo: number, x: number, y: number, z: number): number;
    jwg_cell_create(
        nodes: Int32Array,
        nodeCount: number,
        constants: Float64Array,
        constantCount: number,
        cellCount: number,
        xz: number,
        y: number
    ): number;
    jwg_cell_destroy(handle: number): void;
    jwg_cell_fill(handle: number, corners: Float64Array, out: Float64Array): void;
}

const signatures: { readonly [Name in keyof NativeSymbols]: FfiSignature } = {
    jwg_abi_version: ['i32', []],
    jwg_stack_create: ['f64', ['buffer', 'buffer', 'i32']],
    jwg_stack_destroy: ['void', ['f64']],
    jwg_stack_get3: ['f64', ['f64', 'f64', 'f64', 'f64']],
    jwg_stack_fill: ['void', ['f64', 'buffer', 'buffer', 'i32']],
    jwg_program_create: ['f64', ['buffer', 'i32', 'buffer', 'i32', 'buffer', 'i32', 'buffer', 'i32', 'i32']],
    jwg_program_destroy: ['void', ['f64']],
    jwg_program_eval: ['f64', ['f64', 'f64', 'f64', 'f64']],
    jwg_climate_create: ['f64', ['buffer', 'buffer', 'buffer', 'buffer', 'buffer', 'i32', 'buffer', 'i32', 'i32']],
    jwg_climate_destroy: ['void', ['f64']],
    jwg_climate_find: ['f64', ['f64', 'f64', 'f64', 'f64', 'f64', 'f64', 'f64', 'f64']],
    jwg_biome_jitter: ['f64', ['f64', 'f64', 'f64', 'f64', 'f64']],
    jwg_cell_create: ['f64', ['buffer', 'i32', 'buffer', 'i32', 'i32', 'i32', 'i32']],
    jwg_cell_destroy: ['void', ['f64']],
    jwg_cell_fill: ['void', ['f64', 'buffer', 'buffer']]
};

/** The 32-bit words of one cell program record, `JWG_CELL_WORDS` in the C. */
export const CELL_WORDS = 6;

/**
 * A cell program, as `@jsprismarine/worldgen`'s `CellProgram` lays a density tree out: records of
 * {@link CELL_WORDS} words, root first, the constants they name, how many `interpolated` cells
 * they read, and the cell's size.
 */
export interface NativeCellSource {
    readonly nodes: Int32Array;
    readonly constants: Float64Array;
    readonly cellCount: number;
    readonly xz: number;
    readonly y: number;
}

/**
 * A climate search tree, as `@jsprismarine/worldgen`'s climate index flattens it: per node, seven
 * min/max pairs in `bounds`, its child range, its leaf value index (-1 for a subtree) and its first
 * leaf rank, then the child list.
 */
export interface NativeClimateSource {
    readonly bounds: Float64Array;
    readonly childStarts: Uint32Array;
    readonly childCounts: Uint32Array;
    readonly valueIndices: Int32Array;
    readonly firstLeafRanks: Uint32Array;
    readonly children: Uint32Array;
    /** The most nodes from the root through one leaf. */
    readonly maxDepth: number;
}

/** The 32-bit words of one density program record, `JWG_PROGRAM_WORDS` in the C. */
export const PROGRAM_WORDS = 6;

/**
 * A density program, as `@jsprismarine/worldgen` encodes a density function tree: records of
 * {@link PROGRAM_WORDS} words, root first, with the constants, link lists and noise stacks they
 * name, and the number of memo slots its caches use.
 */
export interface NativeProgramSource {
    readonly nodes: Int32Array;
    readonly constants: Float64Array;
    readonly links: Int32Array;
    /** The stacks its noise records sample; they have to outlive the program. */
    readonly stacks: readonly NativeNoiseStack[];
    readonly cacheSlots: number;
}

/**
 * One octave of a noise stack, as `@jsprismarine/worldgen`'s `NoiseStack` holds it: a Perlin
 * noise's permutation table and offsets, the factor its coordinates are scaled by, and its weight.
 */
export interface NativeNoiseLayer {
    /** The 256-entry permutation table. */
    readonly permutation: ArrayLike<number>;
    readonly offsetX: number;
    readonly offsetY: number;
    readonly offsetZ: number;
    readonly frequency: number;
    /** The octave's weight, a single-precision value. */
    readonly amplitude: number;
    /**
     * `SmearedPerlinNoise`'s `fudgeYScale`: the step the lattice's y fraction snaps down to, as
     * old blended noise samples. Absent or 0 for plain Perlin noise.
     */
    readonly smearY?: number;
}

/**
 * The library, loaded once for this thread. Every call is synchronous, and each thread that
 * loads it gets its own binding; stacks belong to the thread that made them.
 */
export class NativeWorldgen {
    private readonly bound: BoundNative<NativeSymbols>;
    /** Frees a stack nobody destroyed once it is collected. */
    private readonly finalizer: FinalizationRegistry<number>;
    /** Frees a climate tree once it is collected. */
    private readonly climates: FinalizationRegistry<number>;
    private readonly cells: FinalizationRegistry<number>;

    private constructor(bound: BoundNative<NativeSymbols>) {
        this.bound = bound;
        // A program's handle is registered negated, so one registry frees both kinds.
        this.climates = new FinalizationRegistry((handle) => bound.symbols.jwg_climate_destroy(handle));
        this.cells = new FinalizationRegistry((handle) => bound.symbols.jwg_cell_destroy(handle));
        this.finalizer = new FinalizationRegistry((handle) =>
            handle < 0 ? bound.symbols.jwg_program_destroy(-handle) : bound.symbols.jwg_stack_destroy(handle)
        );
    }

    /**
     * Loads the library and checks that it speaks this binding's interface.
     * @param path - The library's file; {@link locateLibrary} finds it when absent.
     * @returns The bound library.
     * @throws {NativeLibraryError} When there is no library, it does not load, or it speaks another
     *   interface. Every failure to load is one, so a caller can fall back on one `instanceof`.
     */
    public static load(path: string = locateLibrary()): NativeWorldgen {
        let bound: BoundNative<NativeSymbols>;
        try {
            bound = bindNative<NativeSymbols>(path, signatures);
        } catch (error: unknown) {
            // A runtime without an FFI already says what it needs.
            if (error instanceof NativeLibraryError) throw error;
            throw new NativeWorldgenErrors.LibraryDoesNotLoad(
                {
                    path,
                    platform: process.platform,
                    arch: process.arch,
                    value: error instanceof Error ? error.message : String(error)
                },
                { cause: error }
            );
        }
        const version = bound.symbols.jwg_abi_version();
        if (version !== ABI_VERSION) {
            bound.close();
            throw new NativeWorldgenErrors.LibraryInterfaceMismatch({ path, version, abiVersion: ABI_VERSION });
        }
        return new NativeWorldgen(bound);
    }

    /**
     * Registers an octave stack in native memory. Its values are `NoiseStack.get3`'s, bit for bit.
     * @param layers - The octaves, summed in this order.
     * @returns The stack.
     * @throws {NativeWorldgenErrors.InvalidPermutationTable} When a table has other than 256 entries.
     * @throws {NativeWorldgenErrors.StackNotCreated} When the library cannot allocate it.
     */
    public createStack(layers: readonly NativeNoiseLayer[]): NativeNoiseStack {
        const perms = new Uint8Array(layers.length * 256);
        const params = new Float64Array(layers.length * LAYER_PARAMS);
        layers.forEach((layer, index) => {
            if (layer.permutation.length !== 256) {
                throw new NativeWorldgenErrors.InvalidPermutationTable({
                    layer: index,
                    length: layer.permutation.length
                });
            }
            perms.set(Array.from(layer.permutation), index * 256);
            params.set(
                [layer.offsetX, layer.offsetY, layer.offsetZ, layer.frequency, layer.amplitude, layer.smearY ?? 0],
                index * LAYER_PARAMS
            );
        });
        const symbols = this.bound.symbols;
        const handle = symbols.jwg_stack_create(perms, params, layers.length);
        if (handle === 0) throw new NativeWorldgenErrors.StackNotCreated({ layers: layers.length });
        const stack = new NativeNoiseStack(symbols, handle, () => this.finalizer.unregister(stack));
        this.finalizer.register(stack, handle, stack);
        return stack;
    }

    /**
     * Registers a density program, which evaluates its tree in C one position at a time with the
     * same bits as the closures it was encoded from.
     * @param source - The encoded program.
     * @returns The program.
     * @throws {NativeWorldgenErrors.ProgramNotCreated} When a record names something out of
     *   range, or memory runs out.
     */
    public createProgram(source: NativeProgramSource): NativeDensityProgram {
        const stacks = Float64Array.from(source.stacks, (stack) => stack.nativeHandle);
        const symbols = this.bound.symbols;
        const handle = symbols.jwg_program_create(
            source.nodes,
            source.nodes.length / PROGRAM_WORDS,
            source.constants,
            source.constants.length,
            source.links,
            source.links.length,
            stacks,
            stacks.length,
            source.cacheSlots
        );
        if (handle === 0)
            throw new NativeWorldgenErrors.ProgramNotCreated({ nodes: source.nodes.length / PROGRAM_WORDS });
        const program = new NativeDensityProgram(symbols, handle, source.stacks, () =>
            this.finalizer.unregister(program)
        );
        this.finalizer.register(program, -handle, program);
        return program;
    }

    /**
     * Registers a climate search tree, which finds the nearest box in C with the same answer as the
     * TypeScript search, ties included.
     * @param source - The flattened tree.
     * @returns The tree.
     * @throws {NativeWorldgenErrors.ClimateTreeNotCreated} When a node names a child that does not
     *   exist, or memory runs out.
     */
    public createClimate(source: NativeClimateSource): NativeClimateSearch {
        const symbols = this.bound.symbols;
        const nodeCount = source.childCounts.length;
        const handle = symbols.jwg_climate_create(
            source.bounds,
            source.childStarts,
            source.childCounts,
            source.valueIndices,
            source.firstLeafRanks,
            nodeCount,
            source.children,
            source.children.length,
            source.maxDepth
        );
        if (handle === 0) throw new NativeWorldgenErrors.ClimateTreeNotCreated({ nodes: nodeCount });
        const search = new NativeClimateSearch(symbols, handle, () => this.climates.unregister(search));
        this.climates.register(search, handle, search);
        return search;
    }

    /**
     * Registers a cell program, which fills a whole interpolation cell in C with the same bits as
     * the TypeScript `CellProgram` it was laid out by.
     * @param source - The program's records.
     * @returns The program.
     * @throws {NativeWorldgenErrors.CellProgramNotCreated} When a record names something out of
     *   range or runs a TypeScript fallback, the cell holds more than 4096 values, or memory runs
     *   out.
     */
    public createCellProgram(source: NativeCellSource): NativeCellProgram {
        const symbols = this.bound.symbols;
        const nodeCount = source.nodes.length / CELL_WORDS;
        const handle = symbols.jwg_cell_create(
            source.nodes,
            nodeCount,
            source.constants,
            source.constants.length,
            source.cellCount,
            source.xz,
            source.y
        );
        if (handle === 0) throw new NativeWorldgenErrors.CellProgramNotCreated({ nodes: nodeCount });
        const program = new NativeCellProgram(symbols, handle, source.cellCount, source.xz * source.xz * source.y, () =>
            this.cells.unregister(program)
        );
        this.cells.register(program, handle, program);
        return program;
    }

    /**
     * The jitter bits of one biome lattice point, as Java's `BiomeManager` derives them.
     * @param seedHi - The zoom seed's high 32 bits, unsigned.
     * @param seedLo - The zoom seed's low 32 bits, unsigned.
     * @returns Bits 24 to 33 of the x, y and z offsets' generator steps, packed as
     *   `x | y << 10 | z << 20`.
     */
    public biomeJitter(seedHi: number, seedLo: number, x: number, y: number, z: number): number {
        return this.bound.symbols.jwg_biome_jitter(seedHi, seedLo, x, y, z);
    }

    /** Unloads the library. Destroy its stacks first. */
    public close(): void {
        this.bound.close();
    }
}

/** Whether the first `aLength` and `bLength` elements of two views share any byte. */
const overlaps = (a: Float64Array, aLength: number, b: Float64Array, bLength: number): boolean => {
    if (a.buffer !== b.buffer) return false;
    const aStart = a.byteOffset;
    const bStart = b.byteOffset;
    return aStart < bStart + bLength * 8 && bStart < aStart + aLength * 8;
};

/** An octave stack in native memory, made by {@link NativeWorldgen.createStack}. */
export class NativeNoiseStack {
    private readonly symbols: NativeSymbols;
    private readonly forget: () => void;
    private handle: number;

    /**
     * Use {@link NativeWorldgen.createStack}.
     * @internal
     */
    public constructor(symbols: NativeSymbols, handle: number, forget: () => void) {
        this.symbols = symbols;
        this.handle = handle;
        this.forget = forget;
    }

    /**
     * The stack's value at one position.
     * @returns The sum of the octaves, rounded to single precision as `NoiseStack.get3` rounds it.
     * @throws {NativeWorldgenErrors.StackDestroyed} After {@link destroy}.
     */
    public get3(x: number, y: number, z: number): number {
        if (this.handle === 0) throw new NativeWorldgenErrors.StackDestroyed();
        return this.symbols.jwg_stack_get3(this.handle, x, y, z);
    }

    /**
     * Fills `out[i]` with the value at `xyz[3i]`, `xyz[3i + 1]`, `xyz[3i + 2]`, in one call. The
     * two may be views of the same memory.
     * @param xyz - The positions, three coordinates each.
     * @param out - Where the values go; positions beyond its length are not sampled.
     * @throws {NativeWorldgenErrors.StackDestroyed} After {@link destroy}.
     */
    public fill(xyz: Float64Array, out: Float64Array): void {
        if (this.handle === 0) throw new NativeWorldgenErrors.StackDestroyed();
        const count = Math.min(Math.floor(xyz.length / 3), out.length);
        // The library writes each value before it reads the next position, so output that shares
        // memory with the positions would overwrite them; such positions are copied first.
        const positions = overlaps(xyz, count * 3, out, count) ? xyz.slice(0, count * 3) : xyz;
        this.symbols.jwg_stack_fill(this.handle, positions, out, count);
    }

    /**
     * The stack's handle, for a native program that samples it. It stays valid until
     * {@link destroy}, so keep this stack alive while a program names it.
     */
    public get nativeHandle(): number {
        return this.handle;
    }

    /** Frees the stack's native memory. Later calls throw. */
    public destroy(): void {
        if (this.handle === 0) return;
        this.forget();
        this.symbols.jwg_stack_destroy(this.handle);
        this.handle = 0;
    }
}

/** A density program in native memory, made by {@link NativeWorldgen.createProgram}. */
export class NativeDensityProgram {
    private readonly symbols: NativeSymbols;
    private readonly forget: () => void;
    /** The stacks the program samples, held so they live as long as it does. */
    public readonly stacks: readonly NativeNoiseStack[];
    private handle: number;

    /**
     * Use {@link NativeWorldgen.createProgram}.
     * @internal
     */
    public constructor(
        symbols: NativeSymbols,
        handle: number,
        stacks: readonly NativeNoiseStack[],
        forget: () => void
    ) {
        this.symbols = symbols;
        this.handle = handle;
        this.stacks = stacks;
        this.forget = forget;
    }

    /**
     * The program's value at one position.
     * @throws {NativeWorldgenErrors.StackDestroyed} After {@link destroy}.
     */
    public eval(x: number, y: number, z: number): number {
        if (this.handle === 0) throw new NativeWorldgenErrors.StackDestroyed();
        return this.symbols.jwg_program_eval(this.handle, x, y, z);
    }

    /** Frees the program's native memory. Later calls throw. Its stacks stay alive. */
    public destroy(): void {
        if (this.handle === 0) return;
        this.forget();
        this.symbols.jwg_program_destroy(this.handle);
        this.handle = 0;
    }
}

/** A cell program in native memory, made by {@link NativeWorldgen.createCellProgram}. */
export class NativeCellProgram {
    private readonly symbols: NativeSymbols;
    private readonly forget: () => void;
    /** How many corner values a fill reads: eight per interpolated cell. */
    public readonly cornerCount: number;
    /** How many values a fill writes: one per block of the cell. */
    public readonly size: number;
    private handle: number;

    /**
     * Use {@link NativeWorldgen.createCellProgram}.
     * @internal
     */
    public constructor(symbols: NativeSymbols, handle: number, cellCount: number, size: number, forget: () => void) {
        this.symbols = symbols;
        this.handle = handle;
        this.cornerCount = cellCount * 8;
        this.size = size;
        this.forget = forget;
    }

    /**
     * Fills `out` with the tree's value at every block of one cell, x-major, then z, then y. Hook
     * records take their neutral constant, so call it only for a context with no hook set.
     * @param corners - {@link cornerCount} values: each interpolated cell's eight corners in turn.
     * @param out - At least {@link size} values.
     * @throws {NativeWorldgenErrors.StackDestroyed} After {@link destroy}.
     * @throws {NativeWorldgenErrors.CellBufferTooSmall} When a buffer is shorter than the fill.
     */
    public fill(corners: Float64Array, out: Float64Array): void {
        if (this.handle === 0) throw new NativeWorldgenErrors.StackDestroyed();
        if (corners.length < this.cornerCount || out.length < this.size) {
            throw new NativeWorldgenErrors.CellBufferTooSmall({
                corners: corners.length,
                cornerCount: this.cornerCount,
                out: out.length,
                size: this.size
            });
        }
        this.symbols.jwg_cell_fill(this.handle, corners, out);
    }

    /** Frees the program's native memory. Later calls throw. */
    public destroy(): void {
        if (this.handle === 0) return;
        this.forget();
        this.symbols.jwg_cell_destroy(this.handle);
        this.handle = 0;
    }
}

/** A climate search tree in native memory, made by {@link NativeWorldgen.createClimate}. */
export class NativeClimateSearch {
    private readonly symbols: NativeSymbols;
    private readonly forget: () => void;
    private handle: number;

    /**
     * Use {@link NativeWorldgen.createClimate}.
     * @internal
     */
    public constructor(symbols: NativeSymbols, handle: number, forget: () => void) {
        this.symbols = symbols;
        this.handle = handle;
        this.forget = forget;
    }

    /**
     * The leaf nearest a quantized climate target.
     * @param candidate - The leaf the previous search returned, or -1.
     * @returns The leaf's node index, or -1 when the tree yields none.
     * @throws {NativeWorldgenErrors.StackDestroyed} After {@link destroy}.
     */
    public find(
        candidate: number,
        temperature: number,
        humidity: number,
        continentalness: number,
        erosion: number,
        depth: number,
        weirdness: number
    ): number {
        if (this.handle === 0) throw new NativeWorldgenErrors.StackDestroyed();
        return this.symbols.jwg_climate_find(
            this.handle,
            candidate,
            temperature,
            humidity,
            continentalness,
            erosion,
            depth,
            weirdness
        );
    }

    /** Frees the tree's native memory. Later calls throw. */
    public destroy(): void {
        if (this.handle === 0) return;
        this.forget();
        this.symbols.jwg_climate_destroy(this.handle);
        this.handle = 0;
    }
}
