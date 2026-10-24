import { describe, expect, it } from 'vitest';

import { DATA_PACK_FORMAT, comparePackFormats, coversFormat, formatToString, parseMcmeta } from './mcmeta';

describe('parseMcmeta', () => {
    it('parses the 26.3 integer min_format/max_format form', () => {
        const { mcmeta, diagnostics } = parseMcmeta(
            { pack: { description: 'built-in', min_format: 121, max_format: 121 } },
            'p'
        );
        expect(diagnostics).toEqual([]);
        expect(mcmeta?.formats).toBeDefined();
        expect(coversFormat(mcmeta!.formats!, DATA_PACK_FORMAT)).toBe(true);
        expect(coversFormat(mcmeta!.formats!, [121, 7])).toBe(true);
        expect(coversFormat(mcmeta!.formats!, [122, 0])).toBe(false);
    });

    it('parses the [major, minor] array form', () => {
        const { mcmeta } = parseMcmeta({ pack: { min_format: [121, 0], max_format: [121, 1] } }, 'p');
        expect(coversFormat(mcmeta!.formats!, [121, 0])).toBe(true);
        expect(coversFormat(mcmeta!.formats!, [121, 2])).toBe(false);
        expect(coversFormat(mcmeta!.formats!, [120, 9])).toBe(false);
    });

    it('reads a legacy pack_format as that whole major', () => {
        const { mcmeta, diagnostics } = parseMcmeta({ pack: { pack_format: 61, description: 'old' } }, 'p');
        expect(diagnostics).toEqual([]);
        expect(coversFormat(mcmeta!.formats!, [61, 3])).toBe(true);
        expect(coversFormat(mcmeta!.formats!, DATA_PACK_FORMAT)).toBe(false);
    });

    it('reports a pack that declares no format and leaves formats undefined', () => {
        const { mcmeta, diagnostics } = parseMcmeta({ pack: { description: 'none' } }, 'p');
        expect(mcmeta).toBeDefined();
        expect(mcmeta?.formats).toBeUndefined();
        expect(diagnostics).toMatchObject([{ severity: 'error', code: 'mcmeta.missing-format' }]);
    });

    it('fails on a file without a pack block', () => {
        const { mcmeta, diagnostics } = parseMcmeta([], 'p');
        expect(mcmeta).toBeUndefined();
        expect(diagnostics).toMatchObject([{ severity: 'error', code: 'mcmeta.invalid' }]);
    });

    it('parses overlay entries in both the current and legacy range forms', () => {
        const { mcmeta, diagnostics } = parseMcmeta(
            {
                pack: { min_format: 121, max_format: 121 },
                overlays: {
                    entries: [
                        { directory: 'newer', min_format: [121, 0], max_format: 121 },
                        { directory: 'legacy_pair', formats: [60, 62] },
                        { directory: 'legacy_object', formats: { min_inclusive: 48, max_inclusive: 61 } }
                    ]
                }
            },
            'p'
        );
        expect(diagnostics).toEqual([]);
        expect(mcmeta?.overlays.map((overlay) => overlay.directory)).toEqual(['newer', 'legacy_pair', 'legacy_object']);
        expect(coversFormat(mcmeta!.overlays[0]!.formats, DATA_PACK_FORMAT)).toBe(true);
        expect(coversFormat(mcmeta!.overlays[1]!.formats, [61, 5])).toBe(true);
        expect(coversFormat(mcmeta!.overlays[2]!.formats, [61, 0])).toBe(true);
        expect(coversFormat(mcmeta!.overlays[2]!.formats, [62, 0])).toBe(false);
    });

    it('reports an overlay entry with a traversal-shaped directory name', () => {
        const { mcmeta, diagnostics } = parseMcmeta(
            {
                pack: { min_format: 121, max_format: 121 },
                overlays: { entries: [{ directory: '../x', formats: 121 }] }
            },
            'p'
        );
        expect(mcmeta?.overlays).toEqual([]);
        expect(diagnostics).toMatchObject([{ code: 'mcmeta.invalid-overlays' }]);
    });
});

describe('format helpers', () => {
    it('compares and renders formats', () => {
        expect(comparePackFormats([121, 0], [121, 1])).toBeLessThan(0);
        expect(comparePackFormats([121, 1], [121, 1])).toBe(0);
        expect(formatToString([121, 0])).toBe('121.0');
        expect(formatToString([121, Number.MAX_SAFE_INTEGER])).toBe('121.x');
    });
});
