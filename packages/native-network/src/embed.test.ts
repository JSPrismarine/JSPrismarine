import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { provideEmbeddedLibrary } from './embed';
import { LIBRARY_ENV } from './library';

const dirs: string[] = [];
const cacheDir = () => {
    const dir = mkdtempSync(join(tmpdir(), 'jsp-native-embed-'));
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
});
