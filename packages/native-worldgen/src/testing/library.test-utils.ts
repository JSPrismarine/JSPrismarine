import { locateLibrary } from '../library';

/**
 * Whether a build of the library exists for this machine, so a suite that needs it can run.
 * `JSP_NATIVE_WORLDGEN_REQUIRE=1`, which the Native worldgen workflow sets, makes a missing build
 * fail the suite instead of skipping it.
 * @returns True when {@link locateLibrary} finds a file.
 */
export const nativeWorldgenAvailable = (): boolean => {
    if (process.env.JSP_NATIVE_WORLDGEN_REQUIRE === '1') return true;
    try {
        locateLibrary();
        return true;
    } catch {
        return false;
    }
};
