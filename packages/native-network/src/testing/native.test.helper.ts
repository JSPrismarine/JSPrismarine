import { NativeNetwork } from '../NativeNetwork';
import { locateLibrary } from '../library';

/**
 * Whether a build of the library exists for this machine, so a suite that needs it can run.
 * @returns True when {@link locateLibrary} finds a file.
 */
export const nativeLibraryAvailable = (): boolean => {
    try {
        locateLibrary();
        return true;
    } catch {
        return false;
    }
};

/** Loads the library once for a test file. */
export const loadNative = (): Promise<NativeNetwork> => NativeNetwork.load();
