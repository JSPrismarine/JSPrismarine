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
}

const signatures: { readonly [Name in keyof NativeSymbols]: FfiSignature } = {
    jwg_abi_version: ['i32', []],
    jwg_stack_create: ['f64', ['buffer', 'buffer', 'i32']],
    jwg_stack_destroy: ['void', ['f64']],
    jwg_stack_get3: ['f64', ['f64', 'f64', 'f64', 'f64']],
    jwg_stack_fill: ['void', ['f64', 'buffer', 'buffer', 'i32']]
};

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

    private constructor(bound: BoundNative<NativeSymbols>) {
        this.bound = bound;
        this.finalizer = new FinalizationRegistry((handle) => bound.symbols.jwg_stack_destroy(handle));
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

    /** Frees the stack's native memory. Later calls throw. */
    public destroy(): void {
        if (this.handle === 0) return;
        this.forget();
        this.symbols.jwg_stack_destroy(this.handle);
        this.handle = 0;
    }
}
