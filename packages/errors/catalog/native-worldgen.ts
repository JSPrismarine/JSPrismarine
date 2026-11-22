import { NativeLibraryError } from '@jsprismarine/errors/native-library';
import { defineErrors } from './defineErrors';

/** The errors `@jsprismarine/native-worldgen` throws. */
export const NativeWorldgenErrors = defineErrors('native-worldgen', {
    /**
     * The operating system refused to load the native worldgen library, usually because it was
     * built for another platform or misses a system library. The message ends with the loader's
     * reason.
     */
    LibraryDoesNotLoad: {
        message: 'The native worldgen library at {path} does not load on {platform}-{arch}: {value}',
        base: NativeLibraryError
    },
    /**
     * The native worldgen library was built for a different version of this package. Reinstall the
     * package so the two match, or in a checkout, rebuild the library with `pnpm run build:native`
     * in `packages/native-worldgen`.
     */
    LibraryInterfaceMismatch: {
        message: 'The native worldgen library at {path} speaks interface {version}; this package needs {abiVersion}',
        base: NativeLibraryError
    },
    /**
     * The native library could not allocate a noise stack, because memory ran out or the address
     * it got does not fit in the handle a call passes back.
     */
    StackNotCreated: 'The native worldgen library could not create a noise stack of {layers} layers',
    /** A noise layer's permutation table must hold exactly 256 entries, as Java's does. */
    InvalidPermutationTable: 'Layer {layer} has a permutation table of {length} entries; a layer needs 256',
    /** A noise stack or density program was used after `destroy()` freed it. */
    StackDestroyed: 'The noise stack or density program was destroyed',
    /**
     * A cell program was handed a corner buffer or an output buffer shorter than one fill reads or
     * writes; the C would read or write past its end. Size them from the program's `cornerCount`
     * and `size`.
     */
    CellBufferTooSmall:
        'A cell program fill needs {cornerCount} corners and {size} outputs; it was given {corners} and {out}',
    /**
     * The native library refused a climate search tree: a node names a child that does not exist,
     * or memory ran out. A tree the worldgen package flattened is never malformed, so this is a
     * bug; report it.
     */
    ClimateTreeNotCreated: 'The native worldgen library could not create a climate tree of {nodes} nodes',
    /**
     * The native library refused a density program: a record names a node, constant, link, stack
     * or cache slot that does not exist, or memory ran out. A program the worldgen package
     * encoded is never malformed, so this is a bug; report it.
     */
    ProgramNotCreated: 'The native worldgen library could not create a density program of {nodes} nodes',
    /**
     * The native library refused a cell program: a record names a node, constant or interpolated
     * cell that does not exist, runs a TypeScript fallback, or the cell holds more than 4096
     * values, or memory ran out. The worldgen package only hands over programs that fit, so this
     * is a bug; report it.
     */
    CellProgramNotCreated: 'The native worldgen library could not create a cell program of {nodes} nodes',
    /**
     * The native library refused an aquifer: one of its programs was destroyed, its extent is
     * empty, its default fluid is not a fluid code, or memory ran out. The worldgen package only
     * hands over live programs and real extents, so this is a bug; report it.
     */
    AquiferNotCreated: 'The native worldgen library could not create an aquifer',
    /**
     * The native library refused a surface program: an op names a condition, state or vein that
     * does not exist or jumps outside the program, a biome set lies outside the bitsets, a vein's
     * program is destroyed, or memory ran out. The worldgen package lays out only whole programs,
     * so this is a bug; report it.
     */
    SurfaceNotCreated: 'The native worldgen library could not create a surface program'
});
