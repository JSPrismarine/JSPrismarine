import { NativeNetwork } from '../NativeNetwork';
import { locateLibrary } from '../library';

/**
 * Whether a build of the library exists for this machine, so a suite that needs it can run.
 * `JSP_NATIVE_NETWORK_REQUIRE=1`, which the Native network workflow sets, makes a missing build
 * fail the suite instead of skipping it.
 * @returns True when {@link locateLibrary} finds a file.
 */
export const nativeLibraryAvailable = (): boolean => {
    if (process.env.JSP_NATIVE_NETWORK_REQUIRE === '1') return true;
    try {
        locateLibrary();
        return true;
    } catch {
        return false;
    }
};

/** Loads the library once for a test file. */
export const loadNative = (): Promise<NativeNetwork> => NativeNetwork.load();
