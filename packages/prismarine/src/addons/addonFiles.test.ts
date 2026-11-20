import { PrismarineAddonErrors } from '@jsprismarine/errors/prismarine/addon';
import { describe, expect, it } from 'vitest';

import { parseAddonsFile, parseAddonsLockFile } from './addonFiles';

const sha256 = 'a'.repeat(64);
const url = 'https://github.com/JSPrismarine/JSPrismarine/releases/download/addons/warps-1.0.0.mcpack';

describe('parseAddonsFile', () => {
    it('refuses an entry that names two places to install from', () => {
        expect(() =>
            parseAddonsFile({ addons: { warps: { source: 'someone/packs', version: '*', path: './warps' } } })
        ).toThrow(PrismarineAddonErrors.InvalidAddonsFile);
    });
});

describe('parseAddonsLockFile', () => {
    it('refuses a lock with a path and a url, and keeps a source with its download url', () => {
        expect(() =>
            parseAddonsLockFile({
                lockfileVersion: 1,
                addons: { warps: { path: './warps', url, name: 'warps', version: '1.0.0', sha256 } }
            })
        ).toThrow(PrismarineAddonErrors.InvalidAddonsFile);
        expect(
            parseAddonsLockFile({
                lockfileVersion: 1,
                addons: { warps: { source: 'someone/packs', url, name: 'warps', version: '1.0.0', sha256 } }
            }).addons.warps
        ).toEqual({ source: 'someone/packs', url, name: 'warps', version: '1.0.0', sha256 });
    });
});
