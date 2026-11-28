/**
 * Matches Bedrock's vanilla textures to Java's: the table a converted pack uses to retexture a
 * vanilla block or item on Java when a Bedrock pack retextures it. Kept apart from the run, which
 * reads the jar and the samples, so it can be tested on images it is handed.
 */
import { createHash } from 'node:crypto';

/** An image as eight-bit RGBA rows, top row first, as `@jsprismarine/java-packs/image` decodes one. */
export interface MatchImage {
    readonly width: number;
    readonly height: number;
    readonly pixels: Uint8Array;
}

/**
 * Bedrock texture layers that are Vibrant Visuals material data rather than a color texture: the
 * metalness, emissive and roughness maps, the normal maps and the height maps a texture set names.
 * Java has nothing they could match.
 */
const MATERIAL_LAYER = /_(?:mers|mer|normal|heightmap)$/;

/** Whether a Bedrock texture path names a material layer rather than a color texture. */
export const isMaterialLayer = (bedrockPath: string): boolean => MATERIAL_LAYER.test(bedrockPath);

/**
 * The pixels of an image as a key that two images share exactly when they draw the same: its size
 * and the hash of its pixels, with the color of every fully transparent pixel cleared, since an
 * editor keeps any color under alpha 0 and neither edition draws it.
 */
export const pixelKey = ({ width, height, pixels }: MatchImage): string => {
    const cleared = Uint8Array.from(pixels);
    for (let i = 0; i < cleared.length; i += 4) {
        if (cleared[i + 3] === 0) cleared.fill(0, i, i + 3);
    }
    return `${width}x${height}:${createHash('sha256').update(cleared).digest('hex')}`;
};

/** Bedrock's texture folders whose Java counterpart has another name. */
const JAVA_FOLDER: Readonly<Record<string, string>> = { blocks: 'block', items: 'item' };

/**
 * The Java texture a Bedrock texture's name would be, were it the same art: `textures/blocks/stone`
 * is `block/stone`.
 */
export const sameNamedJavaTexture = (bedrockPath: string): string => {
    const [, folder, ...rest] = bedrockPath.split('/');
    return [JAVA_FOLDER[folder!] ?? folder, ...rest].join('/');
};

/** How a Bedrock texture was matched. */
export interface TextureMatches {
    /** The Java textures each matched Bedrock texture becomes, by Bedrock path, in path order. */
    readonly matched: ReadonlyMap<string, readonly string[]>;
    /** The Bedrock textures nothing on Java draws, in path order. */
    readonly unmatched: readonly string[];
    /** How many matched by their name and size, and how many by their pixels alone. */
    readonly byName: number;
    readonly byPixels: number;
}

/** Whether every pixel of an image is fully transparent, which draws nothing whatever its size. */
const isBlank = ({ pixels }: MatchImage): boolean => {
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] !== 0) return false;
    return true;
};

/**
 * Pairs each Bedrock color texture with the Java textures it is.
 *
 * 1. The Java texture of the same name and size, when there is one: the same texture, whatever an
 *    edition retouched.
 * 2. Otherwise every Java texture with the same pixels that no other Bedrock texture claims by
 *    name, since Bedrock then draws each of them with this one. A blank image matches nothing this
 *    way, and neither does a Java texture another Bedrock texture is named for: Bedrock's
 *    `enchanting_table_bottom` has obsidian's pixels, but Bedrock retextures obsidian through its
 *    own `obsidian`.
 *
 * A texture whose layout differs between the editions, such as a chest's, matches neither and
 * stays unmatched, rather than retexturing a Java texture with art laid out for another.
 *
 * @param java - Java's textures by path under `textures/`, without `.png`.
 * @param bedrock - Bedrock's textures by path from the pack root, without an extension.
 */
export const matchTextures = (
    java: ReadonlyMap<string, MatchImage>,
    bedrock: ReadonlyMap<string, MatchImage>
): TextureMatches => {
    const byKey = new Map<string, string[]>();
    for (const [path, image] of java) {
        if (isBlank(image)) continue;
        const key = pixelKey(image);
        byKey.set(key, [...(byKey.get(key) ?? []), path]);
    }
    const sameSize = (a: MatchImage, b: MatchImage | undefined) =>
        b !== undefined && a.width === b.width && a.height === b.height;
    const colors = [...bedrock.keys()].filter((path) => !isMaterialLayer(path)).sort();
    const named = new Map(
        colors
            .map((path) => [path, sameNamedJavaTexture(path)] as const)
            .filter(([path, javaPath]) => sameSize(bedrock.get(path)!, java.get(javaPath)))
    );
    const claimed = new Set(named.values());

    const matched = new Map<string, string[]>();
    const unmatched: string[] = [];
    let byPixels = 0;
    let byName = 0;
    for (const path of colors) {
        const own = named.get(path);
        if (own !== undefined) {
            matched.set(path, [own]);
            byName++;
            continue;
        }
        const image = bedrock.get(path)!;
        const same = isBlank(image) ? [] : (byKey.get(pixelKey(image)) ?? []).filter((each) => !claimed.has(each));
        if (same.length > 0) {
            matched.set(path, same.sort());
            byPixels++;
            continue;
        }
        unmatched.push(path);
    }
    return { matched, unmatched, byPixels, byName };
};
