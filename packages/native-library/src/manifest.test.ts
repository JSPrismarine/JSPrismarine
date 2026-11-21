import { describe, expect, it } from 'vitest';

import { NativeLibraryError } from '@jsprismarine/errors/native-library';

import { parseManifest } from './manifest';

describe('parseManifest', () => {
    it('fails a malformed manifest with the error every loading failure shares', () => {
        expect(() => parseManifest({})).toThrow(NativeLibraryError);
        expect(() =>
            parseManifest({ build: 'b', baseUrl: 'u', platforms: { 'linux-x64-gnu': { shared: 'not a file' } } })
        ).toThrow(NativeLibraryError);
    });
});
