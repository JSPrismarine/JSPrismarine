/**
 * A stack's other Java components as the Bedrock item tags that draw them.
 *
 * Bedrock keeps these in the item's `tag` compound under its own names: `customColor` for dyed
 * leather, `Trim` for an armor trim, `Patterns` and `Base` for a banner or a shield,
 * `FireworksItem` for a firework star, `Fireworks` for a rocket, and `pages`, `title`, `author`
 * and `generation` for a written book. The pinned Bedrock Dedicated Server's binary holds every
 * one of these names. The same tags go to the client in a stack's user data and into the world
 * record, so a vanilla tool reading the world sees what the player sees.
 *
 * A component with no Bedrock form, or a value this cannot read, writes nothing. The Java form
 * stays on the stack either way, under `jsprismarine:components` in the record.
 */
import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import {
    bedrockBannerType,
    bedrockDyeIndexOf,
    isOminousBannerPattern,
    javaBannerPatternToBedrock
} from '@jsprismarine/mapping';
import type { BannerLayer } from '@jsprismarine/mapping';

import { isRecord } from '../utils/isRecord';
import { nearestFireworkDye } from './dyeColors';
import { plainText } from './lootStack';
import type { StackComponents } from './stackComponents';

/**
 * Java's `FireworkExplosion.Shape` names, in the ordinal order Bedrock's `FireworkType` uses.
 *
 * @javaSource FireworkExplosion$Shape.$VALUES
 */
const FIREWORK_SHAPES = ['small_ball', 'large_ball', 'star', 'creeper', 'burst'] as const;

/** Bedrock's `customColor`: an ARGB int with full alpha, signed as NBT stores it. */
const argb = (rgb: number): Types.NumberVal => new Types.NumberVal(0xff000000 | (rgb & 0xffffff) | 0);

/** The path of a registry id, which is what Bedrock names a trim pattern or material by. */
const pathOf = (id: string): string => (id.includes(':') ? id.slice(id.indexOf(':') + 1) : id);

/** A registry reference, which Java writes as an id or, for a datapack's inline entry, an object. */
const referenceOf = (value: unknown): string | undefined => {
    if (typeof value === 'string') return value;
    if (isRecord(value) && typeof value['asset_id'] === 'string') return value['asset_id'];
    if (isRecord(value) && typeof value['asset_name'] === 'string') return value['asset_name'];
    return undefined;
};

/** `minecraft:dyed_color`, which is a bare RGB int or, in older data, `{ rgb }`. */
const dyedColorOf = (value: unknown): number | undefined => {
    if (typeof value === 'number') return value;
    return isRecord(value) && typeof value['rgb'] === 'number' ? value['rgb'] : undefined;
};

/** The RGB ints of a firework explosion's color list. */
const rgbList = (value: unknown): number[] =>
    Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === 'number') : [];

/** A firework's colors as Bedrock's byte array of dye numbers. */
const dyeBytes = (colors: readonly number[]): Buffer =>
    Buffer.from(colors.map((rgb) => bedrockDyeIndexOf(nearestFireworkDye(rgb)) ?? 0));

/** One `minecraft:firework_explosion` as Bedrock's explosion compound. */
const explosionTag = (value: unknown, name: string): NBTTagCompound | undefined => {
    if (!isRecord(value)) return undefined;
    const shape = typeof value['shape'] === 'string' ? pathOf(value['shape']) : 'small_ball';
    const type = FIREWORK_SHAPES.findIndex((candidate) => candidate === shape);

    const tag = new NBTTagCompound(name);
    tag.addValue('FireworkType', new Types.ByteVal(Math.max(0, type)));
    tag.addValue('FireworkColor', dyeBytes(rgbList(value['colors'])));
    tag.addValue('FireworkFade', dyeBytes(rgbList(value['fade_colors'])));
    tag.addValue('FireworkFlicker', new Types.ByteVal(value['has_twinkle'] === true ? 1 : 0));
    tag.addValue('FireworkTrail', new Types.ByteVal(value['has_trail'] === true ? 1 : 0));
    return tag;
};

/**
 * The color a firework star's icon is tinted: the mean of its colors, channel by channel, as
 * Java's client tints it.
 */
const starTint = (colors: readonly number[]): number | undefined => {
    if (colors.length === 0) return undefined;
    let red = 0;
    let green = 0;
    let blue = 0;
    for (const rgb of colors) {
        red += (rgb >> 16) & 0xff;
        green += (rgb >> 8) & 0xff;
        blue += rgb & 0xff;
    }
    const mean = (sum: number): number => Math.floor(sum / colors.length);
    return (mean(red) << 16) | (mean(green) << 8) | mean(blue);
};

/** `minecraft:banner_patterns` as a list of `{ pattern, color }` layers, skipping a bad entry. */
const bannerLayersOf = (value: unknown): BannerLayer[] => {
    if (!Array.isArray(value)) return [];
    const layers: BannerLayer[] = [];
    for (const entry of value) {
        if (!isRecord(entry)) continue;
        const pattern = referenceOf(entry['pattern']);
        const color = entry['color'];
        if (pattern !== undefined && typeof color === 'string') layers.push({ pattern, color });
    }
    return layers;
};

/** Writes a banner's or a shield's layers, or the ominous banner's `Type` in their place. */
const addBannerTags = (tag: NBTTagCompound, value: unknown): boolean => {
    const layers = bannerLayersOf(value);
    if (layers.length === 0) return false;

    // Bedrock draws the ominous banner's eight layers from `Type` and refuses patterns beside
    // it, as `blockentity/javaBlockEntityContent.ts` says of the placed banner.
    if (isOminousBannerPattern(layers)) {
        tag.addValue('Type', new Types.NumberVal(bedrockBannerType.ominous));
        return true;
    }

    const patterns = new Set<NBTTagCompound>();
    for (const layer of layers) {
        const code = javaBannerPatternToBedrock(layer.pattern);
        const color = bedrockDyeIndexOf(layer.color);
        if (code === undefined || color === undefined) continue;
        const entry = new NBTTagCompound('');
        entry.addValue('Color', new Types.NumberVal(color));
        entry.addValue('Pattern', new Types.StringVal(code));
        patterns.add(entry);
    }
    if (patterns.size === 0) return false;
    tag.addValue('Patterns', patterns);
    return true;
};

/** Java's filterable string, a bare string or `{ raw, filtered }`; the raw text is what is shown. */
const filterableText = (value: unknown): string | undefined =>
    isRecord(value) && 'raw' in value ? plainText(value['raw']) : plainText(value);

/** Writes a written book's pages, title, author and generation. */
const addBookTags = (tag: NBTTagCompound, value: unknown): boolean => {
    if (!isRecord(value)) return false;

    const pages = new Set<NBTTagCompound>();
    for (const page of Array.isArray(value['pages']) ? value['pages'] : []) {
        const entry = new NBTTagCompound('');
        entry.addValue('text', new Types.StringVal(filterableText(page) ?? ''));
        entry.addValue('photoname', new Types.StringVal(''));
        pages.add(entry);
    }
    tag.addValue('pages', pages);

    const title = filterableText(value['title']);
    if (title !== undefined) tag.addValue('title', new Types.StringVal(title));
    if (typeof value['author'] === 'string') tag.addValue('author', new Types.StringVal(value['author']));
    const generation = value['generation'];
    tag.addValue('generation', new Types.NumberVal(typeof generation === 'number' ? Math.trunc(generation) : 0));
    return true;
};

/**
 * Writes the Bedrock tags for a stack's other components into its `tag` compound.
 *
 * @param tag - The item's `tag` compound, or the user data compound the client reads.
 * @param components - The stack's bag; see `Item.getComponents`.
 * @returns Whether anything was written.
 */
export const addComponentTags = (tag: NBTTagCompound, components: StackComponents): boolean => {
    let anything = false;

    const color = dyedColorOf(components['minecraft:dyed_color']);
    if (color !== undefined) {
        tag.addValue('customColor', argb(color));
        anything = true;
    }

    const trim = components['minecraft:trim'];
    if (isRecord(trim)) {
        const material = referenceOf(trim['material']);
        const pattern = referenceOf(trim['pattern']);
        if (material !== undefined && pattern !== undefined) {
            const compound = new NBTTagCompound('Trim');
            compound.addValue('Material', new Types.StringVal(pathOf(material)));
            compound.addValue('Pattern', new Types.StringVal(pathOf(pattern)));
            tag.addChild(compound);
            anything = true;
        }
    }

    const star = explosionTag(components['minecraft:firework_explosion'], 'FireworksItem');
    if (star !== undefined) {
        tag.addChild(star);
        const tint = isRecord(components['minecraft:firework_explosion'])
            ? starTint(rgbList(components['minecraft:firework_explosion']['colors']))
            : undefined;
        if (tint !== undefined && color === undefined) tag.addValue('customColor', argb(tint));
        anything = true;
    }

    const fireworks = components['minecraft:fireworks'];
    if (isRecord(fireworks)) {
        const rocket = new NBTTagCompound('Fireworks');
        const explosions = new Set<NBTTagCompound>();
        for (const explosion of Array.isArray(fireworks['explosions']) ? fireworks['explosions'] : []) {
            const entry = explosionTag(explosion, '');
            if (entry !== undefined) explosions.add(entry);
        }
        rocket.addValue('Explosions', explosions);
        const flight = fireworks['flight_duration'];
        rocket.addValue('Flight', new Types.ByteVal(typeof flight === 'number' ? Math.trunc(flight) : 1));
        tag.addChild(rocket);
        anything = true;
    }

    if (addBannerTags(tag, components['minecraft:banner_patterns'])) anything = true;
    const base = components['minecraft:base_color'];
    const baseIndex = typeof base === 'string' ? bedrockDyeIndexOf(base) : undefined;
    if (baseIndex !== undefined) {
        tag.addValue('Base', new Types.NumberVal(baseIndex));
        anything = true;
    }

    if (addBookTags(tag, components['minecraft:written_book_content'])) anything = true;

    return anything;
};
