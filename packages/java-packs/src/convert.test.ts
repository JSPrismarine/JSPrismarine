import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { RELEASE } from '@jsprismarine/protocol/java/versions/26.3/release';
import { beforeAll, describe, expect, it } from 'vitest';

import { convertResourcePacks } from './convert';
import type { BedrockResourcePack, JavaPackTarget } from './convert';
import { encodePng, isPng } from './image';

const encoder = new TextEncoder();
const target: JavaPackTarget = { release: RELEASE.minecraftVersion, format: RELEASE.resourcePackFormat };

const png = (width = 1, height = 1): Uint8Array =>
    encodePng({ width, height, pixels: new Uint8Array(width * height * 4).fill(200) });

/** A one-pixel opaque red TGA, stored top row first. */
const tga = (): Uint8Array => {
    const bytes = new Uint8Array(18 + 4);
    bytes[2] = 2;
    bytes[12] = 1;
    bytes[14] = 1;
    bytes[16] = 32;
    bytes[17] = 8 | 0x20;
    bytes.set([0, 0, 255, 255], 18);
    return bytes;
};

const pack = (name: string, files: Record<string, Uint8Array | string | object>): BedrockResourcePack => ({
    name,
    files: new Map(
        Object.entries(files).map(([path, data]) => [
            path,
            data instanceof Uint8Array ? data : encoder.encode(typeof data === 'string' ? data : JSON.stringify(data))
        ])
    )
});

const text = (bytes: Uint8Array | undefined): unknown =>
    bytes === undefined ? undefined : JSON.parse(new TextDecoder().decode(bytes));

describe('convertResourcePacks', () => {
    const furniture = pack('Furniture', {
        'manifest.json': {},
        'pack_icon.png': png(),
        'textures/blocks/Chair Seat.tga': tga(),
        'textures/blocks/lamp.png': png(1, 2),
        'textures/blocks/lamp.tga': tga(),
        'textures/items/chair.png': png(),
        'textures/flipbook_textures.json':
            '// lenient\n[{ "flipbook_texture": "textures/blocks/lamp", "atlas_tile": "lamp", "ticks_per_frame": 4, "frames": [1, 0], "replicate": 2 }]',
        'textures/terrain_texture.json': {},
        'textures/blocks/lamp.texture_set.json': {},
        'texts/en_US.lang': 'tile.furniture:lamp.name=Lamp\nitem.furniture:chair.name=Chair',
        'texts/de_DE.lang': 'tile.furniture:lamp.name=Lampe',
        'sounds/sound_definitions.json': {
            format_version: '1.20.20',
            sound_definitions: {
                'furniture.creak': { category: 'block', sounds: ['sounds/furniture/Creak'] },
                'furniture.hum': { sounds: ['sounds/furniture/hum'] },
                'furniture.gone': { sounds: ['sounds/furniture/gone'] }
            }
        },
        'sounds/furniture/Creak.ogg': 'OggS creak',
        'sounds/furniture/hum.fsb': 'FSB hum',
        'font/glyph_E1.png': png(16, 16),
        'font/glyph_D8.png': png(16, 16),
        'animations/chair.animation.json': {},
        'particles/dust.json': {},
        'entity/chair.entity.json': {}
    });
    const overrides = pack('Overrides', {
        'manifest.json': {},
        'textures/blocks/lamp.png': png(3, 3),
        'texts/en_US.lang': 'tile.furniture:lamp.name=Better Lamp'
    });

    const converted = convertResourcePacks([overrides, furniture], target);

    it('declares the release format and takes the highest icon in the stack', () => {
        expect(text(converted.files.get('pack.mcmeta'))).toEqual({
            pack: {
                description: 'Converted from Overrides, Furniture',
                min_format: [...RELEASE.resourcePackFormat],
                max_format: [...RELEASE.resourcePackFormat]
            }
        });
        expect(converted.files.get('pack.png')).toEqual(furniture.files.get('pack_icon.png'));
    });

    it('writes every texture as a PNG under the bedrock namespace, the highest pack winning', () => {
        expect(Object.fromEntries(converted.textures)).toEqual({
            'textures/blocks/Chair Seat': 'bedrock:blocks/chair_seat',
            'textures/blocks/lamp': 'bedrock:blocks/lamp',
            'textures/items/chair': 'bedrock:items/chair'
        });
        const seat = converted.files.get('assets/bedrock/textures/blocks/chair_seat.png');
        expect(seat !== undefined && isPng(seat)).toBe(true);
        expect(converted.files.get('assets/bedrock/textures/blocks/lamp.png')).toEqual(png(3, 3));
        expect(text(converted.files.get('assets/minecraft/atlases/blocks.json'))).toEqual({
            sources: [{ type: 'directory', source: 'blocks', prefix: 'blocks/' }]
        });
        expect(converted.files.has('assets/minecraft/atlases/items.json')).toBe(true);
    });

    it('animates a flipbook texture, blending frames unless the flipbook turns it off', () => {
        expect(text(converted.files.get('assets/bedrock/textures/blocks/lamp.png.mcmeta'))).toEqual({
            animation: { frametime: 4, frames: [1, 0], interpolate: true }
        });
    });

    it('merges each locale, the highest pack winning a key', () => {
        expect(text(converted.files.get('assets/bedrock/lang/en_us.json'))).toEqual({
            'item.furniture:chair.name': 'Chair',
            'tile.furniture:lamp.name': 'Better Lamp'
        });
        expect(text(converted.files.get('assets/bedrock/lang/de_de.json'))).toEqual({
            'tile.furniture:lamp.name': 'Lampe'
        });
    });

    it('keeps the events whose sounds ship as Ogg Vorbis, with their files', () => {
        expect(text(converted.files.get('assets/bedrock/sounds.json'))).toEqual({
            'furniture.creak': { sounds: [{ name: 'bedrock:furniture/creak' }] }
        });
        expect(new TextDecoder().decode(converted.files.get('assets/bedrock/sounds/furniture/creak.ogg'))).toBe(
            'OggS creak'
        );
    });

    it('draws each glyph sheet over its code points, and leaves the surrogate range out', () => {
        const font = text(converted.files.get('assets/minecraft/font/default.json'));
        expect(font).toMatchObject({
            providers: [{ type: 'bitmap', file: 'bedrock:font/glyph_e1.png', ascent: 7, height: 8 }]
        });
        const chars = (font as { providers: { chars: string[] }[] }).providers[0]!.chars;
        expect(chars).toHaveLength(16);
        expect(chars[0]!.codePointAt(0)).toBe(0xe100);
        expect(chars[15]!.codePointAt(15)).toBe(0xe1ff);
        expect(converted.files.has('assets/bedrock/textures/font/glyph_d8.png')).toBe(false);
    });

    it('reports what converted, what a later step converts and what Java cannot show', () => {
        const [, report] = converted.report;
        expect(report!.converted).toEqual({ textures: 3, animations: 1, languages: 2, sounds: 1, glyphSheets: 1 });
        expect(report!.notes.map(({ path, outcome }) => `${outcome} ${path}`)).toEqual([
            'unsupported animations',
            'deferred entity',
            'lossy furniture.creak',
            'unreadable furniture.gone: sounds/furniture/gone',
            'unsupported furniture.hum: sounds/furniture/hum',
            'unsupported particles',
            'lossy textures/blocks/lamp',
            'unsupported textures/blocks/lamp.texture_set.json',
            'deferred textures/terrain_texture.json'
        ]);
    });

    it('gives the same files for the same stack', () => {
        const again = convertResourcePacks([overrides, furniture], target);
        expect([...again.files.keys()]).toEqual([...converted.files.keys()]);
        expect([...again.files.values()]).toEqual([...converted.files.values()]);
    });
});

/**
 * Mojang's vanilla resource pack from `bedrock-samples`, converted whole: the corpus every texture,
 * flipbook and language file of the converter answers to. It needs the cache that
 * `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` populates, so it runs only with
 * JSP_VANILLA_RESOURCE_PACK set.
 */
const enabled = !!process.env.JSP_VANILLA_RESOURCE_PACK;
const cacheRoot = join(import.meta.dirname, '..', '..', '..', 'node_modules', '.cache', 'jsprismarine');

/** The vanilla resource pack folder of the newest `bedrock-samples` checkout. */
const vanillaResourcePack = (): string => {
    const root = join(cacheRoot, 'bedrock-samples');
    for (const version of readdirSync(root).sort().reverse()) {
        const unpacked = join(root, version, 'unpacked');
        if (!existsSync(unpacked)) continue;
        for (const checkout of readdirSync(unpacked)) {
            const folder = join(unpacked, checkout, 'resource_pack');
            if (existsSync(join(folder, 'textures'))) return folder;
        }
    }
    throw new Error(`no bedrock-samples checkout under ${root}; run the bedrock-data fetch:sources script`);
};

describe.skipIf(!enabled)('the vanilla Bedrock resource pack', { tags: ['real-data'] }, () => {
    const files = new Map<string, Uint8Array>();
    let converted: ReturnType<typeof convertResourcePacks>;

    // Reading the 3328 TGAs and converting them is the slow part, so it is set-up, not the test.
    beforeAll(() => {
        const folder = vanillaResourcePack();
        for (const entry of readdirSync(folder, { recursive: true, withFileTypes: true })) {
            if (!entry.isFile()) continue;
            const path = relative(folder, join(entry.parentPath, entry.name)).split(sep).join('/');
            if (path.startsWith('textures/') || path.startsWith('texts/') || path.startsWith('sounds/'))
                files.set(path, new Uint8Array(readFileSync(join(entry.parentPath, entry.name))));
        }
        converted = convertResourcePacks([{ name: 'vanilla', files }], target);
    });

    it('converts every texture, flipbook and language file with none unreadable', () => {
        const [report] = converted.report;
        // Vanilla's sound definitions name some files the pack does not ship, and one of its
        // `.png` files is a JPEG; nothing else may fail to read.
        const unreadable = report!.notes.filter(
            ({ outcome, reason }) =>
                outcome === 'unreadable' && !reason.includes('no pack holds') && !reason.includes('JPEG')
        );

        expect(unreadable).toEqual([]);
        const tgas = [...files.keys()].filter((path) => path.endsWith('.tga')).length;
        expect(report!.converted.textures).toBeGreaterThanOrEqual(tgas);
        expect(report!.converted.animations).toBeGreaterThan(0);
        expect(converted.files.has('assets/bedrock/lang/en_us.json')).toBe(true);
    });
});
