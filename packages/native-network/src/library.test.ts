import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { NativeLibraryError } from '@jsprismarine/errors/native-library';

import { installedLibraryPath } from './install';
import { LIBRARY_ENV, locateLibrary } from './library';

const dirs: string[] = [];
afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("the package's native library", () => {
    it('tells a published package without a build how to approve this package', () => {
        const packageDir = mkdtempSync(join(tmpdir(), 'jsp-native-network-'));
        dirs.push(packageDir);
        const manifest = { build: '', baseUrl: '', platforms: {} };
        const attempt = () => locateLibrary({ packageDir, platform: 'linux-x64-gnu', manifest, env: {} });

        expect(attempt).toThrow(NativeLibraryError);
        expect(attempt).toThrow('npm install-scripts approve @jsprismarine/native-network');
        expect(attempt).toThrow('JSP_NATIVE_NETWORK_LIBRARY');
    });

    it('installs into prebuilds under the platform, named for this library', () => {
        expect(installedLibraryPath('/pkg', 'win32-x64')).toBe(
            join('/pkg', 'prebuilds', 'win32-x64', 'libjsp_native_network.dll')
        );
        expect(LIBRARY_ENV).toBe('JSP_NATIVE_NETWORK_LIBRARY');
    });
});
