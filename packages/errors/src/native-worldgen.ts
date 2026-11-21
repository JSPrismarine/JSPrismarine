import { defineErrors } from '@jsprismarine/errors/JSPrismarineError';
import { NativeLibraryError } from '@jsprismarine/errors/native-library';

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
    /** A noise stack was sampled after `destroy()` freed it. */
    StackDestroyed: 'The noise stack was destroyed'
});
