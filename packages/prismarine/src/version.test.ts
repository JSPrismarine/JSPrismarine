import { afterEach, describe, expect, it, vi } from 'vitest';

import pkg from '../package.json' with { type: 'json' };
import Server from './Server';
import { serverVersion } from './version';

describe('serverVersion', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('falls back to the package version when running from source', () => {
        expect(serverVersion()).toBe(pkg.version);
    });

    it('reports the version a build stamped in', () => {
        vi.stubGlobal('BUILD_VERSION', '0.16.0-nightly.20261031.1');

        expect(serverVersion()).toBe('0.16.0-nightly.20261031.1');
    });

    it('is what Server#getVersion returns, so /version matches the startup log', () => {
        vi.stubGlobal('BUILD_VERSION', '0.16.0-nightly.20261031.1');

        expect(Server.prototype.getVersion.call(undefined)).toBe('0.16.0-nightly.20261031.1');
    });
});
