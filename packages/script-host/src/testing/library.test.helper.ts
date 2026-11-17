import { ScriptHostLibrary } from '../ScriptEngine';
import { locateLibrary } from '../library';

/**
 * Whether a build of the library exists for this machine, so a suite that needs it can run.
 * `JSP_SCRIPT_HOST_REQUIRE=1`, which CI sets on Linux x64, makes a missing build fail the suite
 * instead of skipping it.
 * @returns True when {@link locateLibrary} finds a file.
 */
export const scriptHostAvailable = (): boolean => {
    if (process.env.JSP_SCRIPT_HOST_REQUIRE === '1') return true;
    try {
        locateLibrary();
        return true;
    } catch {
        return false;
    }
};

/** Loads the library once for a test file. */
export const loadLibrary = (): ScriptHostLibrary => ScriptHostLibrary.load();
