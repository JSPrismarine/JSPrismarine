import { AddonToolsErrors, InvalidAddonIndexError } from '@jsprismarine/errors/addon-tools';
import { describe, expect, it } from 'vitest';

import type { AddonIndexEntry } from './addonIndex';
import {
    ADDON_INDEX_SCHEMA_VERSION,
    compareAddonVersions,
    createAddonIndex,
    mergeAddonIndex,
    parseAddonIndex,
    serializeAddonIndex
} from './addonIndex';

const entry = (name: string, version: string, hashDigit = 'a'): AddonIndexEntry => ({
    name,
    version,
    description: `${name} does things.`,
    minServer: '0.22.0',
    url: `https://github.com/owner/repo/releases/download/addons/${name}-${version}.mcpack`,
    sha256: hashDigit.repeat(64)
});

describe('parseAddonIndex', () => {
    it('reads an index and keeps its entries sorted by name, then version', () => {
        const index = parseAddonIndex({
            schemaVersion: ADDON_INDEX_SCHEMA_VERSION,
            addons: [entry('warps', '1.0.0'), entry('tps-bar', '1.10.0'), entry('tps-bar', '1.9.0')]
        });

        expect(index.addons.map(({ name, version }) => `${name}@${version}`)).toEqual([
            'tps-bar@1.9.0',
            'tps-bar@1.10.0',
            'warps@1.0.0'
        ]);
    });

    it('drops keys an entry has beyond the schema', () => {
        const index = parseAddonIndex({
            schemaVersion: ADDON_INDEX_SCHEMA_VERSION,
            addons: [{ ...entry('warps', '1.0.0'), homepage: 'https://example.com' }]
        });

        expect(index.addons[0]).toEqual(entry('warps', '1.0.0'));
    });

    it('round-trips through the text it serializes to', () => {
        const index = createAddonIndex([entry('warps', '1.0.0'), entry('tps-bar', '1.0.0')]);

        expect(parseAddonIndex(JSON.parse(serializeAddonIndex(index)))).toEqual(index);
        expect(serializeAddonIndex(index).endsWith('}\n')).toBe(true);
    });

    it('refuses another schema version', () => {
        expect(() => parseAddonIndex({ schemaVersion: ADDON_INDEX_SCHEMA_VERSION + 1, addons: [] })).toThrow(
            AddonToolsErrors.UnsupportedAddonIndexVersion
        );
    });

    const withAddons = (addons: unknown[]) => ({ schemaVersion: ADDON_INDEX_SCHEMA_VERSION, addons });
    const invalid: [string, unknown][] = [
        ['an array', []],
        ['an index without addons', { schemaVersion: ADDON_INDEX_SCHEMA_VERSION }],
        ['an entry without a hash', withAddons([{ ...entry('warps', '1.0.0'), sha256: undefined }])],
        ['an uppercase hash', withAddons([{ ...entry('warps', '1.0.0'), sha256: 'A'.repeat(64) }])],
        ['a plain http URL', withAddons([{ ...entry('warps', '1.0.0'), url: 'http://example.com/warps.mcpack' }])],
        ['a version with a leading zero', withAddons([entry('warps', '1.01.0')])],
        ['a version part past the safe integers', withAddons([entry('warps', '1.0.9007199254740992')])],
        ['a minServer that is a range', withAddons([{ ...entry('warps', '1.0.0'), minServer: '^0.22.0' }])],
        ['a name with capitals', withAddons([entry('Warps', '1.0.0')])],
        ['one version listed twice', withAddons([entry('warps', '1.0.0'), entry('warps', '1.0.0', 'b')])]
    ];

    it.each(invalid)('refuses %s', (_, value) => {
        expect(() => parseAddonIndex(value)).toThrow(AddonToolsErrors.InvalidAddonIndex);
        expect(() => parseAddonIndex(value)).toThrow(InvalidAddonIndexError);
    });
});

describe('compareAddonVersions', () => {
    it('compares each part as a number', () => {
        expect(compareAddonVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
        expect(compareAddonVersions('0.1.0', '1.0.0')).toBeLessThan(0);
        expect(compareAddonVersions('2.0.1', '2.0.1')).toBe(0);
    });
});

describe('mergeAddonIndex', () => {
    it('keeps every published version and reports the versions it adds', () => {
        const published = createAddonIndex([entry('tps-bar', '1.0.0'), entry('warps', '1.0.0')]);
        const { index, added } = mergeAddonIndex(published, [entry('tps-bar', '1.1.0', 'b'), entry('warps', '1.0.0')]);

        expect(index.addons).toEqual([
            entry('tps-bar', '1.0.0'),
            entry('tps-bar', '1.1.0', 'b'),
            entry('warps', '1.0.0')
        ]);
        expect(added).toEqual([entry('tps-bar', '1.1.0', 'b')]);
    });

    it('adds everything before the first release', () => {
        const built = [entry('warps', '1.0.0'), entry('tps-bar', '1.0.0')];

        expect(mergeAddonIndex(undefined, built)).toEqual({
            index: createAddonIndex(built),
            added: [entry('tps-bar', '1.0.0'), entry('warps', '1.0.0')]
        });
    });

    it('refuses a published version whose pack changed', () => {
        const published = createAddonIndex([entry('tps-bar', '1.0.0')]);

        expect(() => mergeAddonIndex(published, [entry('tps-bar', '1.0.0', 'b')])).toThrow(
            AddonToolsErrors.PublishedVersionChanged
        );
    });
});
