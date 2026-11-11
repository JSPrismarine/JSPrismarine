import { NativeNetwork, locateLibrary } from '@jsprismarine/native-network';

import { nativeDriver } from '../nativeDriver';
import type { WebRtcDriver } from '../WebRtcDriver';

/**
 * Whether the native library can be found, so a suite that runs real peers can. The Native
 * network workflow sets `JSP_NATIVE_NETWORK_REQUIRE=1`, which fails such a suite instead.
 */
export const nativeAvailable = (): boolean => {
    if (process.env.JSP_NATIVE_NETWORK_REQUIRE === '1') return true;
    try {
        locateLibrary();
        return true;
    } catch {
        return false;
    }
};

/** The native driver, loaded once per test file. */
export const loadDriver = async (): Promise<WebRtcDriver> => nativeDriver(await NativeNetwork.load());
