import { afterEach, describe, expect, it, vi } from 'vitest';

import pkg from '../package.json' with { type: 'json' };
import Server from './Server';
import { buildStamp, buildType, packageBuildType, serverVersion } from './version';

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

describe('buildType', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('is dev for a server run from source, with no build stamp', () => {
        expect(buildStamp()).toBeUndefined();
        expect(buildType()).toBe('dev');
    });

    it.each(['release', 'nightly'] as const)('is the stamped %s for an executable', (type) => {
        vi.stubGlobal('BUILD_TYPE', type);

        expect(buildStamp()).toBe(type);
        expect(buildType()).toBe(type);
    });

    it('ignores a stamp it does not know', () => {
        vi.stubGlobal('BUILD_TYPE', 'beta');

        expect(buildStamp()).toBeUndefined();
        expect(buildType()).toBe('dev');
    });

    it('is release for the npm package at a release version, which carries no stamp', () => {
        vi.stubGlobal('BUILD_DIST', true);
        vi.stubGlobal('BUILD_VERSION', '0.20.0');

        expect(buildType()).toBe('release');
    });

    it('is nightly for the npm package at an unstable snapshot version', () => {
        vi.stubGlobal('BUILD_DIST', true);
        vi.stubGlobal('BUILD_VERSION', '0.21.0-unstable-20261112121906');

        expect(buildType()).toBe('nightly');
    });

    it('keeps an executable stamp over the package version', () => {
        vi.stubGlobal('BUILD_DIST', true);
        vi.stubGlobal('BUILD_TYPE', 'nightly');
        vi.stubGlobal('BUILD_VERSION', '0.20.0');

        expect(buildType()).toBe('nightly');
    });

    it.each([
        ['0.20.0', 'release'],
        ['1.0.0', 'release'],
        ['0.21.0-unstable-20261112121906', 'nightly'],
        ['0.20.0-nightly.20261112.1', 'nightly']
    ])('reads a package build at %s as %s', (version, type) => {
        expect(packageBuildType(version)).toBe(type);
    });
});
