/**
 * Converts a stack of Bedrock resource packs into one Java resource pack. The conversion is a pure
 * function of the packs and the target release: it reads no file and keeps no state, so the same
 * input always gives the same output, and a caller can cache the result by its inputs alone.
 *
 * This first slice converts what has a Java form on its own: the pack's description and icon,
 * every texture as PNG under the `bedrock` namespace with its flipbook animation, the language
 * files, the custom sounds that ship as Ogg Vorbis, and glyph fonts. What later slices convert,
 * and what no vanilla Java client can show, is listed in the report.
 */
import { parseLenientJson } from '@jsprismarine/packs/lenientJson';

import { decodeTga, encodePng, isPng } from './image';
import { isRecord } from './isRecord';
import { javaLocaleOf, parseLang } from './lang';
import { BEDROCK_NAMESPACE, javaPath, withoutExtension } from './resourceLocation';
import type { JavaSoundEvent } from './sounds';
import { convertSoundDefinitions } from './sounds';

/** One Bedrock resource pack: its files by their path inside it. */
export interface BedrockResourcePack {
    /** The pack's name, from its manifest, for the description and the report. */
    readonly name: string;
    readonly files: ReadonlyMap<string, Uint8Array>;
}

/** The Java release a conversion is for. */
export interface JavaPackTarget {
    /** The release id, such as `26.3`. */
    readonly release: string;
    /** The resource pack format its client reads, `[major, minor]`, which `pack.mcmeta` declares. */
    readonly format: readonly [number, number];
}

/** What happened to something a pack holds that did not convert as it is. */
export type ConversionOutcome =
    /** It converted, losing what the reason names. */
    | 'lossy'
    /** A later part of the conversion handles it; this one leaves it out. */
    | 'deferred'
    /** No vanilla Java client can show it. */
    | 'unsupported'
    /** It did not read. */
    | 'unreadable';

/** One note of the report. */
export interface ConversionNote {
    /** A path in the pack, or a sound event's name. */
    readonly path: string;
    readonly outcome: ConversionOutcome;
    readonly reason: string;
}

/** What one Bedrock pack gave the Java pack. */
export interface PackConversionReport {
    readonly pack: string;
    /** How many of each kind of asset converted. */
    readonly converted: {
        readonly textures: number;
        readonly animations: number;
        readonly languages: number;
        readonly sounds: number;
        readonly glyphSheets: number;
    };
    /** Everything else, in path order. */
    readonly notes: readonly ConversionNote[];
}

/** A converted pack. */
export interface ConvertedJavaPack {
    /** The Java pack's files by path, in path order, ready for `writeZip`. */
    readonly files: ReadonlyMap<string, Uint8Array>;
    /**
     * The Java texture each Bedrock texture became, by its Bedrock path without an extension:
     * `textures/blocks/stone` is `bedrock:blocks/stone`. A model a later step writes names these.
     */
    readonly textures: ReadonlyMap<string, string>;
    /** Per Bedrock pack, in stack order, top first. */
    readonly report: readonly PackConversionReport[];
}

/**
 * Top-level entries a later step of the conversion reads, and why this one leaves them out. Each
 * reason is the one the report gives.
 */
const DEFERRED: Readonly<Record<string, string>> = {
    'blocks.json': 'custom block appearance converts with custom blocks',
    models: 'geometry converts with custom blocks, items and entities',
    entity: 'client entities convert with custom entities',
    attachables: 'attachables convert with custom items',
    fogs: 'fog converts into biome registry data',
    'biomes_client.json': 'client biome data converts into biome registry data',
    biomes: 'client biome data converts into biome registry data'
};

/** Top-level entries no vanilla Java client can show. */
const UNSUPPORTED: Readonly<Record<string, string>> = {
    animations: 'Molang animations do not run on Java',
    animation_controllers: 'animation controllers do not run on Java',
    render_controllers: 'render controllers do not run on Java',
    particles: 'Java builds its particle types in',
    ui: 'Java has no JSON UI',
    materials: 'Java has no Bedrock materials',
    shaders: 'Bedrock shaders do not translate to Java',
    cameras: 'Java has no camera presets',
    atmospherics: 'Vibrant Visuals data has no Java form',
    color_grading: 'Vibrant Visuals data has no Java form',
    lighting: 'Vibrant Visuals data has no Java form',
    water: 'Vibrant Visuals data has no Java form',
    pbr: 'Vibrant Visuals data has no Java form',
    subpacks: 'Java has no subpacks; the default tier converts',
    'sounds.json': 'Java decides which sounds a block or mob plays; the server plays them'
};

/** Top-level entries this step converts, or that belong to every pack. */
const CONVERTED = new Set(['manifest.json', 'pack_icon.png', 'textures', 'texts', 'sounds', 'font']);

/** Files under `textures/` that are data for a later step rather than images. */
const TEXTURE_DATA: Readonly<Record<string, string>> = {
    'textures/terrain_texture.json': 'block texture names convert with custom blocks and vanilla overrides',
    'textures/item_texture.json': 'item texture names convert with custom items and vanilla overrides',
    'textures/flipbook_textures.json': ''
};

const TEXTURE = /^textures\/.+\.(png|tga)$/i;
const GLYPH_SHEET = /^font\/glyph_([0-9a-fA-F]{2})\.png$/;
const SOUND_DEFINITIONS = 'sounds/sound_definitions.json';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** JSON as the Java pack holds it: four-space indented and ending in a newline, so a pack diffs well. */
const json = (value: unknown): Uint8Array => encoder.encode(`${JSON.stringify(value, null, 4)}\n`);

/** A JSON file of a pack, read leniently, or undefined when it does not read. */
const readJson = (bytes: Uint8Array | undefined): unknown => {
    if (bytes === undefined) return undefined;
    try {
        return parseLenientJson(decoder.decode(bytes));
    } catch {
        return undefined;
    }
};

/** A report under construction. */
interface ReportBuilder {
    readonly pack: string;
    readonly converted: {
        textures: number;
        animations: number;
        languages: number;
        sounds: number;
        glyphSheets: number;
    };
    readonly notes: ConversionNote[];
}

/**
 * Converts a stack of Bedrock resource packs, top first, into one Java resource pack for a release.
 * A file the stack holds more than once comes from the highest pack that holds it, as Bedrock
 * resolves it, and so does a language key and a sound event.
 */
export const convertResourcePacks = (
    stack: readonly BedrockResourcePack[],
    target: JavaPackTarget
): ConvertedJavaPack => {
    const files = new Map<string, Uint8Array>();
    const textures = new Map<string, string>();
    const reports: ReportBuilder[] = stack.map(({ name }) => ({
        pack: name,
        converted: { textures: 0, animations: 0, languages: 0, sounds: 0, glyphSheets: 0 },
        notes: []
    }));
    const note = (report: ReportBuilder, path: string, outcome: ConversionOutcome, reason: string) =>
        report.notes.push({ path, outcome, reason });

    // Bottom first, so a higher pack's file replaces a lower one's.
    const bottomFirst = stack.map((pack, index) => ({ pack, report: reports[index]! })).reverse();

    for (const { pack, report } of bottomFirst) {
        noteTopLevel(pack, report, note);
        convertTextures(pack, report, files, textures, note);
    }
    // After every texture, so a flipbook in one pack animates a texture another pack supplies.
    for (const { pack, report } of bottomFirst) convertFlipbooks(pack, report, files, textures, note);
    convertLanguages(bottomFirst, files);
    convertSounds(stack, bottomFirst, files, note);
    convertGlyphSheets(bottomFirst, files);
    writeAtlases(textures, files);

    const icon = stack.find(({ files: packFiles }) => isPng(packFiles.get('pack_icon.png') ?? new Uint8Array()));
    if (icon !== undefined) files.set('pack.png', icon.files.get('pack_icon.png')!);
    files.set(
        'pack.mcmeta',
        json({
            pack: {
                description: `Converted from ${stack.map(({ name }) => name).join(', ') || 'no Bedrock packs'}`,
                min_format: [...target.format],
                max_format: [...target.format]
            }
        })
    );

    return {
        files: new Map([...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
        textures,
        report: reports.map(({ pack, converted, notes }) => ({
            pack,
            converted,
            notes: notes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
        }))
    };
};

type Note = (report: ReportBuilder, path: string, outcome: ConversionOutcome, reason: string) => void;

/** Notes each top-level entry of a pack that this step does not convert. */
const noteTopLevel = (pack: BedrockResourcePack, report: ReportBuilder, note: Note): void => {
    const roots = new Set([...pack.files.keys()].map((path) => path.split('/')[0]!));
    for (const root of [...roots].sort()) {
        if (CONVERTED.has(root)) continue;
        const deferred = DEFERRED[root];
        const unsupported = UNSUPPORTED[root];
        if (deferred !== undefined) note(report, root, 'deferred', deferred);
        else if (unsupported !== undefined) note(report, root, 'unsupported', unsupported);
        else note(report, root, 'unsupported', 'it is not part of a resource pack Java reads');
    }
};

/**
 * Writes every PNG and TGA texture as a PNG under `assets/bedrock/textures/`, at its Bedrock path
 * inside `textures/`. A path that holds both a PNG and a TGA takes the PNG.
 */
const convertTextures = (
    pack: BedrockResourcePack,
    report: ReportBuilder,
    files: Map<string, Uint8Array>,
    textures: Map<string, string>,
    note: Note
): void => {
    const byTexture = new Map<string, string>();
    for (const path of [...pack.files.keys()].sort()) {
        if (path.startsWith('textures/') && path.endsWith('.texture_set.json')) {
            note(report, path, 'unsupported', 'Vibrant Visuals texture sets have no Java form');
            continue;
        }
        const data = TEXTURE_DATA[path];
        if (data !== undefined) {
            if (data !== '') note(report, path, 'deferred', data);
            continue;
        }
        if (!TEXTURE.test(path)) {
            if (path.startsWith('textures/')) note(report, path, 'unsupported', 'it is not a PNG or TGA texture');
            continue;
        }
        const texture = withoutExtension(path);
        const chosen = byTexture.get(texture);
        if (chosen === undefined || /\.tga$/i.test(chosen)) byTexture.set(texture, path);
    }
    for (const [texture, path] of byTexture) {
        const bytes = pack.files.get(path)!;
        let png: Uint8Array;
        if (/\.png$/i.test(path)) {
            if (!isPng(bytes)) {
                // Mojang's own pack names a JPEG `.png`, which Bedrock reads and Java does not.
                const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
                note(
                    report,
                    path,
                    'unreadable',
                    jpeg ? 'it is a JPEG file, which Java does not read' : 'it is not a PNG file'
                );
                continue;
            }
            png = bytes;
        } else {
            const image = decodeTga(bytes);
            if (!image.ok) {
                note(report, path, 'unreadable', `the TGA does not read: ${image.reason}`);
                continue;
            }
            png = encodePng(image);
        }
        const location = javaPath(texture.slice('textures/'.length));
        files.set(`assets/${BEDROCK_NAMESPACE}/textures/${location}.png`, png);
        textures.set(texture, `${BEDROCK_NAMESPACE}:${location}`);
        report.converted.textures++;
    }
};

/**
 * Writes each flipbook as the `.png.mcmeta` animation of its texture: `ticks_per_frame` is the
 * frame time, `frames` the frame order, and `blend_frames`, which Bedrock turns on unless a
 * flipbook turns it off, Java's `interpolate`.
 */
const convertFlipbooks = (
    pack: BedrockResourcePack,
    report: ReportBuilder,
    files: Map<string, Uint8Array>,
    textures: ReadonlyMap<string, string>,
    note: Note
): void => {
    const path = 'textures/flipbook_textures.json';
    if (!pack.files.has(path)) return;
    const value = readJson(pack.files.get(path));
    if (!Array.isArray(value)) {
        note(report, path, 'unreadable', 'it is not a JSON list of flipbooks');
        return;
    }
    for (const entry of value) {
        if (!isRecord(entry) || typeof entry.flipbook_texture !== 'string') continue;
        const texture = textures.get(entry.flipbook_texture);
        if (texture === undefined) {
            note(report, entry.flipbook_texture, 'unreadable', 'its flipbook names a texture no pack holds');
            continue;
        }
        const frames = Array.isArray(entry.frames)
            ? entry.frames.filter(
                  (frame: unknown) => typeof frame === 'number' && Number.isInteger(frame) && frame >= 0
              )
            : undefined;
        if (entry.replicate !== undefined && entry.replicate !== 1)
            note(report, entry.flipbook_texture, 'lossy', 'Java does not replicate an animated texture across tiles');
        const location = texture.slice(`${BEDROCK_NAMESPACE}:`.length);
        files.set(
            `assets/${BEDROCK_NAMESPACE}/textures/${location}.png.mcmeta`,
            json({
                animation: {
                    frametime:
                        typeof entry.ticks_per_frame === 'number' ? Math.max(1, Math.round(entry.ticks_per_frame)) : 1,
                    ...(frames === undefined || frames.length === 0 ? {} : { frames }),
                    interpolate: entry.blend_frames !== false
                }
            })
        );
        report.converted.animations++;
    }
};

/** Writes each locale's keys, a higher pack's value winning, as `assets/bedrock/lang/<locale>.json`. */
const convertLanguages = (
    bottomFirst: readonly { readonly pack: BedrockResourcePack; readonly report: ReportBuilder }[],
    files: Map<string, Uint8Array>
): void => {
    const locales = new Map<string, Map<string, string>>();
    for (const { pack, report } of bottomFirst) {
        for (const [path, bytes] of [...pack.files].sort(([a], [b]) => (a < b ? -1 : 1))) {
            const locale = javaLocaleOf(path);
            if (locale === undefined) continue;
            const keys = locales.get(locale) ?? new Map<string, string>();
            for (const [key, text] of parseLang(decoder.decode(bytes))) keys.set(key, text);
            locales.set(locale, keys);
            report.converted.languages++;
        }
    }
    for (const [locale, keys] of locales) {
        files.set(
            `assets/${BEDROCK_NAMESPACE}/lang/${locale}.json`,
            json(Object.fromEntries([...keys].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))))
        );
    }
};

/**
 * Writes `assets/bedrock/sounds.json` from every pack's sound definitions, a higher pack's event
 * winning, with each Ogg Vorbis file the events play. A file the stack holds only as WAV or FSB,
 * which Java cannot play, is left out with its sound, and an event left with no sound is dropped.
 */
const convertSounds = (
    stack: readonly BedrockResourcePack[],
    bottomFirst: readonly { readonly pack: BedrockResourcePack; readonly report: ReportBuilder }[],
    files: Map<string, Uint8Array>,
    note: Note
): void => {
    const events = new Map<string, { readonly event: JavaSoundEvent; readonly report: ReportBuilder }>();
    // The Bedrock path each Java sound file came from, whose case the Java path no longer keeps.
    const bedrockOf = new Map<string, string>();
    for (const { pack, report } of bottomFirst) {
        if (!pack.files.has(SOUND_DEFINITIONS)) continue;
        const value = readJson(pack.files.get(SOUND_DEFINITIONS));
        if (value === undefined) {
            note(report, SOUND_DEFINITIONS, 'unreadable', 'it is not JSON');
            continue;
        }
        const converted = convertSoundDefinitions(value);
        for (const name of converted.lossy)
            note(report, name, 'lossy', 'Java keeps one distance for a sound and no category');
        for (const [name, event] of converted.events) events.set(name, { event, report });
        for (const { bedrock, java } of converted.files) bedrockOf.set(java, bedrock);
    }

    /** The highest pack's file at a Bedrock path with an extension. */
    const find = (path: string, extension: string): Uint8Array | undefined => {
        for (const pack of stack) {
            const bytes = pack.files.get(`${path}.${extension}`);
            if (bytes !== undefined) return bytes;
        }
        return undefined;
    };

    const written = new Map<string, Uint8Array>();
    const sounds: Record<string, JavaSoundEvent> = {};
    for (const [name, { event, report }] of [...events].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
        const kept = event.sounds.filter((sound) => {
            const java = sound.name.slice(`${BEDROCK_NAMESPACE}:`.length);
            const bedrock = bedrockOf.get(java) ?? `sounds/${java}`;
            if (written.has(java)) return true;
            const ogg = find(bedrock, 'ogg');
            if (ogg !== undefined) {
                written.set(java, ogg);
                return true;
            }
            const other =
                find(bedrock, 'wav') !== undefined ? 'WAV' : find(bedrock, 'fsb') !== undefined ? 'FSB' : undefined;
            note(
                report,
                `${name}: ${bedrock}`,
                other === undefined ? 'unreadable' : 'unsupported',
                other === undefined
                    ? 'no pack holds the sound file'
                    : `Java plays Ogg Vorbis only, and the file is ${other}`
            );
            return false;
        });
        if (kept.length === 0) continue;
        sounds[name] = { sounds: kept };
        report.converted.sounds++;
    }
    for (const [java, bytes] of written) files.set(`assets/${BEDROCK_NAMESPACE}/sounds/${java}.ogg`, bytes);
    if (Object.keys(sounds).length > 0) files.set(`assets/${BEDROCK_NAMESPACE}/sounds.json`, json(sounds));
};

/**
 * Writes each glyph sheet, `font/glyph_XX.png`, as a bitmap font provider for the default font:
 * sheet `XX` draws code points `0xXX00` to `0xXXFF`, sixteen to a row. Sheets in the surrogate
 * range name no characters and are left out.
 */
const convertGlyphSheets = (
    bottomFirst: readonly { readonly pack: BedrockResourcePack; readonly report: ReportBuilder }[],
    files: Map<string, Uint8Array>
): void => {
    const sheets = new Map<number, Uint8Array>();
    const owners = new Map<number, ReportBuilder>();
    for (const { pack, report } of bottomFirst) {
        for (const [path, bytes] of pack.files) {
            const match = GLYPH_SHEET.exec(path);
            if (match === null || !isPng(bytes)) continue;
            const page = Number.parseInt(match[1]!, 16);
            if (page >= 0xd8 && page <= 0xdf) continue;
            sheets.set(page, bytes);
            owners.set(page, report);
        }
    }
    if (sheets.size === 0) return;
    const providers = [...sheets.keys()]
        .sort((a, b) => a - b)
        .map((page) => {
            const name = `glyph_${page.toString(16).padStart(2, '0')}`;
            files.set(`assets/${BEDROCK_NAMESPACE}/textures/font/${name}.png`, sheets.get(page)!);
            owners.get(page)!.converted.glyphSheets++;
            return {
                type: 'bitmap',
                file: `${BEDROCK_NAMESPACE}:font/${name}.png`,
                ascent: 7,
                height: 8,
                chars: Array.from({ length: 16 }, (_, row) =>
                    String.fromCharCode(...Array.from({ length: 16 }, (_, column) => (page << 8) | (row * 16 + column)))
                )
            };
        });
    files.set('assets/minecraft/font/default.json', json({ providers }));
};

/**
 * Adds the converted block and item textures to the block and item atlases. Java stitches only the
 * folders an atlas lists, and the converted textures keep Bedrock's folder names, so each folder
 * the conversion wrote joins its atlas.
 */
const writeAtlases = (textures: ReadonlyMap<string, string>, files: Map<string, Uint8Array>): void => {
    const folders = new Set(
        [...textures.values()].map((texture) => texture.slice(`${BEDROCK_NAMESPACE}:`.length).split('/')[0]!)
    );
    for (const [atlas, folder] of [
        ['blocks', 'blocks'],
        ['items', 'items']
    ] as const) {
        if (!folders.has(folder)) continue;
        files.set(
            `assets/minecraft/atlases/${atlas}.json`,
            json({ sources: [{ type: 'directory', source: folder, prefix: `${folder}/` }] })
        );
    }
};
