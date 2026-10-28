/**
 * The name-to-name halves of a Java block entity's contents.
 *
 * A block entity's shape is NBT, and NBT is not this package's business: the compounds are built
 * in `@jsprismarine/prismarine`, beside the chunk that stores them. What crosses editions as a
 * name or a number is here, beside every other Java-to-Bedrock table, because each of these
 * three is a vocabulary rather than a layout.
 *
 * A banner names its patterns by identifier in Java and by a short code in Bedrock. A dye color
 * is a word in Java and an index in Bedrock, and the index runs backwards. A sign's text color
 * is a word in Java and a packed ARGB integer in Bedrock. The layouts those values sit in are
 * stated in `blockentity/javaBlockEntityContent.ts`.
 */
import { itemsTable } from './tables';

/** One layer of a banner, as either edition names one. */
export interface BannerLayer {
    /** The Java pattern identifier, for example `minecraft:triangle_top`. */
    readonly pattern: string;
    /** The Java dye color word, for example `light_gray`. */
    readonly color: string;
}

/**
 * Bedrock's short code for each of Java 26.3's 43 banner patterns.
 *
 * Neither edition publishes this pairing in data. Bedrock's pinned 1.26.51 server binary holds
 * both vocabularies, the codes and the long names the client draws its textures by, but it
 * holds them in a merged string pool with nothing joining one to the other, which is why
 * {@link import('./lossList').UNTRANSLATED_REGISTRIES} still carries `banner_pattern` as a
 * registry no identifier table answers. The pairing below is the one GeyserMC keeps in
 * `BannerPattern.java` and the one the Minecraft Wiki's Banner/Patterns page tabulates, read
 * off both and agreeing.
 *
 * The Java column is checked against the pinned census rather than trusted: the property test
 * fails when Java 26.3 publishes a pattern with no row here, so a pattern added by a later
 * version cannot pass silently as an unstyled banner.
 *
 * Two of the names look like omissions and are not. Java renamed the in-game "Field Masoned"
 * and "Bordure Indented" patterns to `bricks` and `curly_border`; only the loom items kept the
 * older words, so there is no `field_masoned` or `bordure_indented` pattern to have a row.
 */
const BANNER_PATTERN_CODES: Readonly<Record<string, string>> = {
    'minecraft:base': 'b',
    'minecraft:border': 'bo',
    'minecraft:bricks': 'bri',
    'minecraft:circle': 'mc',
    'minecraft:creeper': 'cre',
    'minecraft:cross': 'cr',
    'minecraft:curly_border': 'cbo',
    'minecraft:diagonal_left': 'ld',
    'minecraft:diagonal_right': 'rud',
    'minecraft:diagonal_up_left': 'lud',
    'minecraft:diagonal_up_right': 'rd',
    'minecraft:flow': 'flw',
    'minecraft:flower': 'flo',
    'minecraft:globe': 'glb',
    'minecraft:gradient': 'gra',
    'minecraft:gradient_up': 'gru',
    'minecraft:guster': 'gus',
    'minecraft:half_horizontal': 'hh',
    'minecraft:half_horizontal_bottom': 'hhb',
    'minecraft:half_vertical': 'vh',
    'minecraft:half_vertical_right': 'vhr',
    'minecraft:mojang': 'moj',
    'minecraft:piglin': 'pig',
    'minecraft:rhombus': 'mr',
    'minecraft:skull': 'sku',
    'minecraft:small_stripes': 'ss',
    'minecraft:square_bottom_left': 'bl',
    'minecraft:square_bottom_right': 'br',
    'minecraft:square_top_left': 'tl',
    'minecraft:square_top_right': 'tr',
    'minecraft:straight_cross': 'sc',
    'minecraft:stripe_bottom': 'bs',
    'minecraft:stripe_center': 'cs',
    'minecraft:stripe_downleft': 'dls',
    'minecraft:stripe_downright': 'drs',
    'minecraft:stripe_left': 'ls',
    'minecraft:stripe_middle': 'ms',
    'minecraft:stripe_right': 'rs',
    'minecraft:stripe_top': 'ts',
    'minecraft:triangle_bottom': 'bt',
    'minecraft:triangle_top': 'tt',
    'minecraft:triangles_bottom': 'bts',
    'minecraft:triangles_top': 'tts'
};

/**
 * The eight layers that make a banner the ominous one a raid captain carries.
 *
 * Java marks it nowhere. The item carries a name and a rarity component, but the block entity a
 * structure template saves carries only the layers, so the banner is recognized by being this
 * exact sequence, which is how GeyserMC recognizes it too. Bedrock draws the whole thing from
 * one field, {@link bedrockBannerType}'s `1`, and refuses patterns beside it.
 */
const OMINOUS_BANNER_LAYERS: readonly BannerLayer[] = [
    { pattern: 'minecraft:rhombus', color: 'cyan' },
    { pattern: 'minecraft:stripe_bottom', color: 'light_gray' },
    { pattern: 'minecraft:stripe_center', color: 'gray' },
    { pattern: 'minecraft:border', color: 'light_gray' },
    { pattern: 'minecraft:stripe_middle', color: 'black' },
    { pattern: 'minecraft:half_horizontal', color: 'light_gray' },
    { pattern: 'minecraft:circle', color: 'light_gray' },
    { pattern: 'minecraft:border', color: 'black' }
];

/** Bedrock's `Type` for a banner that is the ominous one, and for a banner that is not. */
export const bedrockBannerType = { ominous: 1, normal: 0 } as const;

/**
 * Java's sixteen dye colors, in the order Java numbers them.
 *
 * The order is Java's `DyeColor` ordinal, which is also the order the sixteen colored blocks of
 * a set are listed in. It is written down because a word has to become a number somewhere, and
 * the number Bedrock wants is derived from this one rather than listed beside it.
 */
const JAVA_DYE_COLORS: readonly string[] = [
    'white',
    'orange',
    'magenta',
    'light_blue',
    'yellow',
    'lime',
    'pink',
    'gray',
    'light_gray',
    'cyan',
    'purple',
    'blue',
    'brown',
    'green',
    'red',
    'black'
];

/**
 * The palette index Java assigns to one dye color.
 *
 * @param javaColor - The Java dye color word, for example `light_gray`.
 * @returns The Java dye ordinal, or undefined for a word outside the palette.
 */
export const javaDyeColorIndexOf = (javaColor: string): number | undefined => {
    const index = JAVA_DYE_COLORS.indexOf(javaColor);
    return index < 0 ? undefined : index;
};

/**
 * The index Bedrock files a banner's color under, for Java's word.
 *
 * Bedrock counts the sixteen the other way round, so Java's white is 15 and Java's black is 0.
 * The inversion is not asserted here, it is read out of the generated item table: Bedrock files
 * all sixteen banners under one `minecraft:banner` and tells them apart by the item's data
 * value, which is the same number the block entity's `Base` holds. Deriving it keeps one pinned
 * source for the sixteen rather than a second copy that can drift from the first.
 *
 * @param javaColor - The Java dye color word, for example `light_gray`.
 * @returns The Bedrock index, or undefined for a word that is not one of Java's sixteen dyes.
 */
export const bedrockDyeIndexOf = (javaColor: string): number | undefined => {
    if (!JAVA_DYE_COLORS.includes(javaColor)) return undefined;

    return itemsTable.items[`minecraft:${javaColor}_banner`]?.bedrockData ?? 0;
};

/**
 * Bedrock's short code for a Java banner pattern.
 *
 * @param javaPattern - The Java pattern identifier, for example `minecraft:triangle_top`.
 * @returns The code, or undefined for a pattern Java 26.3 does not publish. A datapack's own
 *   pattern lands here, and it has no Bedrock code at all: Bedrock draws patterns from its own
 *   client assets and has nowhere to put one that was shipped with a world.
 */
export const javaBannerPatternToBedrock = (javaPattern: string): string | undefined =>
    BANNER_PATTERN_CODES[javaPattern];

/** Every Java banner pattern this package has a Bedrock code for, for the totality check. */
export const javaBannerPatternsWithBedrockCodes = (): readonly string[] => Object.keys(BANNER_PATTERN_CODES);

/**
 * Whether a banner's layers are the ominous banner's eight.
 *
 * @param layers - The layers in the order the banner stacks them, which is the order they are
 *   saved in; a different order is a different banner.
 */
export const isOminousBannerPattern = (layers: readonly BannerLayer[]): boolean =>
    layers.length === OMINOUS_BANNER_LAYERS.length &&
    layers.every(
        (layer, index) =>
            layer.pattern === OMINOUS_BANNER_LAYERS[index]?.pattern &&
            layer.color === OMINOUS_BANNER_LAYERS[index]?.color
    );

/**
 * The packed ARGB a Bedrock sign draws each Java dye color's text in.
 *
 * Bedrock's `SignTextColor` is one signed 32-bit integer with the alpha byte on. Fourteen of the
 * sixteen are Java's own text color with alpha forced to 255, and GeyserMC and the Minecraft
 * Wiki's Bedrock block entity page agree on those fourteen. They part on two.
 *
 * White is `0xfff9fffe` here, which is Java's. Bedrock's own white is `0xfff0f0f0`, a shade
 * darker, and sending Java's keeps a white sign the color the world it came from drew it.
 *
 * Black is `0xff000000` here, which is Bedrock's. Java's black is `0xff1d1d21`, very nearly
 * black, and it is the color a sign gets by writing no color at all, so the two never differ on
 * screen. GeyserMC sends flat black for the same reason it is sent here: Java's near-black does
 * not read against a glowing sign's outline.
 */
const SIGN_TEXT_COLORS: Readonly<Record<string, number>> = {
    white: 0xfff9fffe | 0,
    orange: 0xfff9801d | 0,
    magenta: 0xffc74ebd | 0,
    light_blue: 0xff3ab3da | 0,
    yellow: 0xfffed83d | 0,
    lime: 0xff80c71f | 0,
    pink: 0xfff38baa | 0,
    gray: 0xff474f52 | 0,
    light_gray: 0xff9d9d97 | 0,
    cyan: 0xff169c9c | 0,
    purple: 0xff8932b8 | 0,
    blue: 0xff3c44aa | 0,
    brown: 0xff835432 | 0,
    green: 0xff5e7c16 | 0,
    red: 0xffb02e26 | 0,
    black: 0xff000000 | 0
};

/**
 * The `SignTextColor` a Java dye color writes.
 *
 * @param javaColor - The Java dye color word a sign's face carries under `color`.
 * @returns The signed 32-bit ARGB, or undefined for a word that is not one of Java's sixteen
 *   dyes.
 */
export const bedrockSignTextColorOf = (javaColor: string): number | undefined => SIGN_TEXT_COLORS[javaColor];
