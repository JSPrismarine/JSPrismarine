import { inflateSync } from 'node:zlib';

/** The horizontal metrics of one font: enough to measure a line of text, not to shape it. */
export interface FontMetrics {
    unitsPerEm: number;
    /** The advance width of a character in font units, the missing glyph's for a character the font lacks. */
    advance(codePoint: number): number;
    /** Whether the font has a glyph for a character. */
    covers(codePoint: number): boolean;
}

/** Each table of a WOFF file, decompressed, by tag. */
function woffTables(woff: Buffer) {
    if (woff.toString('latin1', 0, 4) !== 'wOFF') throw new Error('A card font is not a WOFF file.');
    const tables = new Map<string, Buffer>();
    const count = woff.readUInt16BE(12);
    for (let index = 0; index < count; index++) {
        const entry = 44 + index * 20;
        const tag = woff.toString('latin1', entry, entry + 4);
        const offset = woff.readUInt32BE(entry + 4);
        const compressed = woff.readUInt32BE(entry + 8);
        const length = woff.readUInt32BE(entry + 12);
        const data = woff.subarray(offset, offset + compressed);
        tables.set(tag, compressed < length ? inflateSync(data) : data);
    }
    return tables;
}

/** The character to glyph map from a `cmap` subtable in format 4 (the BMP) or 12 (all of Unicode). */
function characterMap(cmap: Buffer) {
    const glyphs = new Map<number, number>();
    const subtables = cmap.readUInt16BE(2);
    const offsets = new Map<number, number>();
    for (let index = 0; index < subtables; index++) {
        const record = 4 + index * 8;
        const offset = cmap.readUInt32BE(record + 4);
        offsets.set(cmap.readUInt16BE(offset), offset);
    }
    const full = offsets.get(12);
    if (full !== undefined) {
        const groups = cmap.readUInt32BE(full + 12);
        for (let index = 0; index < groups; index++) {
            const group = full + 16 + index * 12;
            const first = cmap.readUInt32BE(group);
            const last = cmap.readUInt32BE(group + 4);
            const glyph = cmap.readUInt32BE(group + 8);
            for (let code = first; code <= last; code++) glyphs.set(code, glyph + code - first);
        }
        return glyphs;
    }
    const basic = offsets.get(4);
    if (basic === undefined) throw new Error('A card font has no Unicode character map.');
    const segments = cmap.readUInt16BE(basic + 6) / 2;
    const ends = basic + 14;
    const starts = ends + segments * 2 + 2;
    const deltas = starts + segments * 2;
    const rangeOffsets = deltas + segments * 2;
    for (let segment = 0; segment < segments; segment++) {
        const first = cmap.readUInt16BE(starts + segment * 2);
        const last = cmap.readUInt16BE(ends + segment * 2);
        const delta = cmap.readInt16BE(deltas + segment * 2);
        const rangeAt = rangeOffsets + segment * 2;
        const rangeOffset = cmap.readUInt16BE(rangeAt);
        for (let code = first; code <= last && code !== 0xffff; code++) {
            // A range offset points from its own position into the glyph id array.
            const glyph =
                rangeOffset === 0 ? code + delta : cmap.readUInt16BE(rangeAt + rangeOffset + (code - first) * 2);
            if (glyph !== 0) glyphs.set(code, (glyph + (rangeOffset === 0 ? 0 : delta)) & 0xffff);
        }
    }
    return glyphs;
}

/**
 * Reads a WOFF font's advance widths straight from its `head`, `hhea`, `hmtx` and `cmap` tables.
 * Measuring without kerning comes out a little wide for display type, whose kerning tightens it, so a
 * line that measures as fitting never overflows on the card.
 */
export function readFontMetrics(woff: Buffer): FontMetrics {
    const tables = woffTables(woff);
    const table = (tag: string) => {
        const data = tables.get(tag);
        if (!data) throw new Error(`A card font has no ${tag} table.`);
        return data;
    };
    const unitsPerEm = table('head').readUInt16BE(18);
    const longMetrics = table('hhea').readUInt16BE(34);
    const hmtx = table('hmtx');
    const glyphs = characterMap(table('cmap'));
    // Glyphs past the last long metric share its advance width.
    const advanceOf = (glyph: number) => hmtx.readUInt16BE(Math.min(glyph, longMetrics - 1) * 4);
    return {
        unitsPerEm,
        advance: (codePoint) => advanceOf(glyphs.get(codePoint) ?? 0),
        covers: (codePoint) => glyphs.has(codePoint)
    };
}
