/**
 * Java's map palette: `MapColor` and `MapColor$Brightness`, read off the 26.3 server.
 *
 * A map stores each pixel as a packed id, the color's id in the high six bits and a brightness
 * in the low two, and the client turns it into a color. `@jsprismarine/mapping` names each block
 * state's color by its constant's name in lower case, which is the key here.
 */

/** Every `MapColor` constant by its name in lower case: its id and its base RGB. */
const MAP_COLORS = {
    none: { id: 0, rgb: 0x000000 },
    grass: { id: 1, rgb: 0x7fb238 },
    sand: { id: 2, rgb: 0xf7e9a3 },
    wool: { id: 3, rgb: 0xc7c7c7 },
    fire: { id: 4, rgb: 0xff0000 },
    ice: { id: 5, rgb: 0xa0a0ff },
    metal: { id: 6, rgb: 0xa7a7a7 },
    plant: { id: 7, rgb: 0x007c00 },
    snow: { id: 8, rgb: 0xffffff },
    clay: { id: 9, rgb: 0xa4a8b8 },
    dirt: { id: 10, rgb: 0x976d4d },
    stone: { id: 11, rgb: 0x707070 },
    water: { id: 12, rgb: 0x4040ff },
    wood: { id: 13, rgb: 0x8f7748 },
    quartz: { id: 14, rgb: 0xfffcf5 },
    color_orange: { id: 15, rgb: 0xd87f33 },
    color_magenta: { id: 16, rgb: 0xb24cd8 },
    color_light_blue: { id: 17, rgb: 0x6699d8 },
    color_yellow: { id: 18, rgb: 0xe5e533 },
    color_light_green: { id: 19, rgb: 0x7fcc19 },
    color_pink: { id: 20, rgb: 0xf27fa5 },
    color_gray: { id: 21, rgb: 0x4c4c4c },
    color_light_gray: { id: 22, rgb: 0x999999 },
    color_cyan: { id: 23, rgb: 0x4c7f99 },
    color_purple: { id: 24, rgb: 0x7f3fb2 },
    color_blue: { id: 25, rgb: 0x334cb2 },
    color_brown: { id: 26, rgb: 0x664c33 },
    color_green: { id: 27, rgb: 0x667f33 },
    color_red: { id: 28, rgb: 0x993333 },
    color_black: { id: 29, rgb: 0x191919 },
    gold: { id: 30, rgb: 0xfaee4d },
    diamond: { id: 31, rgb: 0x5cdbd5 },
    lapis: { id: 32, rgb: 0x4a80ff },
    emerald: { id: 33, rgb: 0x00d93a },
    podzol: { id: 34, rgb: 0x815631 },
    nether: { id: 35, rgb: 0x700200 },
    terracotta_white: { id: 36, rgb: 0xd1b1a1 },
    terracotta_orange: { id: 37, rgb: 0x9f5224 },
    terracotta_magenta: { id: 38, rgb: 0x95576c },
    terracotta_light_blue: { id: 39, rgb: 0x706c8a },
    terracotta_yellow: { id: 40, rgb: 0xba8524 },
    terracotta_light_green: { id: 41, rgb: 0x677535 },
    terracotta_pink: { id: 42, rgb: 0xa04d4e },
    terracotta_gray: { id: 43, rgb: 0x392923 },
    terracotta_light_gray: { id: 44, rgb: 0x876b62 },
    terracotta_cyan: { id: 45, rgb: 0x575c5c },
    terracotta_purple: { id: 46, rgb: 0x7a4958 },
    terracotta_blue: { id: 47, rgb: 0x4c3e5c },
    terracotta_brown: { id: 48, rgb: 0x4c3223 },
    terracotta_green: { id: 49, rgb: 0x4c522a },
    terracotta_red: { id: 50, rgb: 0x8e3c2e },
    terracotta_black: { id: 51, rgb: 0x251610 },
    crimson_nylium: { id: 52, rgb: 0xbd3031 },
    crimson_stem: { id: 53, rgb: 0x943f61 },
    crimson_hyphae: { id: 54, rgb: 0x5c191d },
    warped_nylium: { id: 55, rgb: 0x167e86 },
    warped_stem: { id: 56, rgb: 0x3a8e8c },
    warped_hyphae: { id: 57, rgb: 0x562c3e },
    warped_wart_block: { id: 58, rgb: 0x14b485 },
    deepslate: { id: 59, rgb: 0x646464 },
    raw_iron: { id: 60, rgb: 0xd8af93 },
    glow_lichen: { id: 61, rgb: 0x7fa796 }
} as const;

/** The name of one {@link MAP_COLORS} entry. */
export type MapColorName = keyof typeof MAP_COLORS;

/** The colors a map is drawn with by name, as `{ id, rgb }`. */
export const MapColors: { readonly [Name in MapColorName]: { readonly id: number; readonly rgb: number } } = MAP_COLORS;

/** Base RGB by color id. */
const RGB_BY_ID: ReadonlyMap<number, number> = new Map(Object.values(MAP_COLORS).map((color) => [color.id, color.rgb]));
const ID_BY_NAME: ReadonlyMap<string, number> = new Map(
    Object.entries(MAP_COLORS).map(([name, color]) => [name, color.id])
);

/** The id of a color named the way `@jsprismarine/mapping` names it, or `none`'s for an unknown name. */
export const mapColorIdOf = (name: string): number => ID_BY_NAME.get(name) ?? MAP_COLORS.none.id;

/** `MapColor$Brightness`, by the id Java packs beside the color and the multiplier it applies. */
export const Brightness = {
    LOW: { id: 0, modifier: 180 },
    NORMAL: { id: 1, modifier: 220 },
    HIGH: { id: 2, modifier: 255 },
    LOWEST: { id: 3, modifier: 135 }
} as const;

/** One {@link Brightness}. */
export type Brightness = (typeof Brightness)[keyof typeof Brightness];

const BRIGHTNESS_MODIFIERS: readonly number[] = [
    Brightness.LOW.modifier,
    Brightness.NORMAL.modifier,
    Brightness.HIGH.modifier,
    Brightness.LOWEST.modifier
];

/** `MapColor.getPackedId`: the color id in the high six bits, the brightness in the low two. */
export const packedMapColor = (colorId: number, brightness: Brightness): number => (colorId << 2) | brightness.id;

/**
 * One packed Java map color as a Bedrock pixel: `MapColor.calculateARGBColor` with the
 * channels in the order a Bedrock client reads them, red in the low byte and alpha in the
 * high one. `none`, which Java draws as 0, is fully transparent, which the client draws as bare
 * parchment.
 */
export const bedrockPixelOf = (packedId: number): number => {
    const colorId = packedId >> 2;
    const rgb = RGB_BY_ID.get(colorId);
    const modifier = BRIGHTNESS_MODIFIERS[packedId & 3];
    if (colorId === MAP_COLORS.none.id || rgb === undefined || modifier === undefined) return 0;
    // `ARGB.scaleRGB`: each channel times the modifier over 255, in long arithmetic.
    const scale = (channel: number): number => Math.trunc((channel * modifier) / 255);
    const red = scale((rgb >> 16) & 0xff);
    const green = scale((rgb >> 8) & 0xff);
    const blue = scale(rgb & 0xff);
    return (0xff000000 | (blue << 16) | (green << 8) | red) >>> 0;
};
