import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { provideEmbeddedLibrary } from './embed';
import { LIBRARY_ENV, locateLibrary } from './library';
import type { NativeManifest } from './manifest';

const dirs: string[] = [];
const cacheDir = () => {
    const dir = mkdtempSync(join(tmpdir(), 'jsp-script-host-embed-'));
    dirs.push(dir);
    return dir;
};
afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('an executable’s embedded library', () => {
    it('is written once under its digest and named in the environment', () => {
        const cache = cacheDir();
        const env: NodeJS.ProcessEnv = {};
        const library = Buffer.from('embedded library bytes');

        const path = provideEmbeddedLibrary(library, cache, env);
        const written = statSync(path).mtimeMs;
        const again = provideEmbeddedLibrary(library, cache, env);

        expect(again).toBe(path);
        expect(statSync(path).mtimeMs).toBe(written);
        expect(readFileSync(path)).toStrictEqual(library);
        expect(env[LIBRARY_ENV]).toBe(path);
    });

    it('replaces a damaged copy, and leaves a library the user named alone', () => {
        const cache = cacheDir();
        const library = Buffer.from('the real library');
        const path = provideEmbeddedLibrary(library, cache, {});
        writeFileSync(path, 'damaged');
        const env: NodeJS.ProcessEnv = { [LIBRARY_ENV]: '/opt/my-build.so' };

        provideEmbeddedLibrary(library, cache, env);

        expect(readFileSync(path)).toStrictEqual(library);
        expect(env[LIBRARY_ENV]).toBe('/opt/my-build.so');
    });

    it('loads when the manifest publishes another build, as one built from changed sources does', () => {
        // The executable checked the bytes when it embedded them, against the `build.json` of
        // a local `build:native`. The extracted copy has to pass the same check at start.
        const env: NodeJS.ProcessEnv = {};
        const library = Buffer.from('a build of changed native sources');
        const manifest: NativeManifest = {
            build: 'published',
            baseUrl: 'https://example.invalid/',
            platforms: { 'linux-x64': { shared: { file: 'libjsp_script_host.so', bytes: 1, sha256: 'e9945' } } }
        };

        const path = provideEmbeddedLibrary(library, cacheDir(), env);

        expect(locateLibrary({ env, platform: 'linux-x64', manifest })).toBe(path);
    });

    it('records the digest again when the record beside a copy is lost', () => {
        const cache = cacheDir();
        const env: NodeJS.ProcessEnv = {};
        const library = Buffer.from('embedded library bytes');
        const path = provideEmbeddedLibrary(library, cache, {});
        rmSync(join(path, '..', 'build.json'));

        provideEmbeddedLibrary(library, cache, env);

        expect(locateLibrary({ env, platform: 'linux-x64', manifest: { build: '', baseUrl: '', platforms: {} } })).toBe(
            path
        );
    });
});
