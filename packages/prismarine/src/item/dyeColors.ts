/**
 * Java's two RGB colors for each dye: the one it tints leather and wool with, and the one a
 * firework explodes in. Java's `DyeColor` keeps both, and the two differ for every dye: white
 * dyes leather `0xF9FFFE` and makes a `0xF0F0F0` firework.
 */
import { DYE_COLORS } from '@jsprismarine/loot';
import { javaDyeColorIndexOf } from '@jsprismarine/mapping';

/**
 * The sixteen `DyeColor.fireworkColor` values of Java 26.3, by dye.
 *
 * @javaSource DyeColor.$VALUES
 */
const FIREWORK_COLORS: Readonly<Record<string, number>> = {
    white: 15790320,
    orange: 15435844,
    magenta: 12801229,
    light_blue: 6719955,
    yellow: 14602026,
    lime: 4312372,
    pink: 14188952,
    gray: 4408131,
    light_gray: 11250603,
    cyan: 2651799,
    purple: 8073150,
    blue: 2437522,
    brown: 5320730,
    green: 3887386,
    red: 11743532,
    black: 1973019
};

/**
 * The color a dye tints leather armor with, Java's `DyeColor.getTextureDiffuseColor`.
 *
 * @javaSee DyeColor.getTextureDiffuseColor
 */
export const dyeTextureRgb = (dyeColor: string): number | undefined => {
    const index = javaDyeColorIndexOf(dyeColor);
    return index === undefined ? undefined : DYE_COLORS[index];
};

/**
 * The color a dye gives a firework star, Java's `DyeColor.getFireworkColor`.
 *
 * @javaSee DyeColor.getFireworkColor
 */
export const dyeFireworkRgb = (dyeColor: string): number | undefined => FIREWORK_COLORS[dyeColor];

/**
 * The dye whose firework color is nearest an RGB value.
 *
 * Bedrock numbers a firework's colors by dye rather than storing RGB, so a color a command
 * wrote that no dye makes goes out as the closest dye's.
 */
export const nearestFireworkDye = (rgb: number): string => {
    let best = 'white';
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const [dye, candidate] of Object.entries(FIREWORK_COLORS)) {
        const red = ((candidate >> 16) & 0xff) - ((rgb >> 16) & 0xff);
        const green = ((candidate >> 8) & 0xff) - ((rgb >> 8) & 0xff);
        const blue = (candidate & 0xff) - (rgb & 0xff);
        const distance = red * red + green * green + blue * blue;
        if (distance < bestDistance) {
            best = dye;
            bestDistance = distance;
        }
    }
    return best;
};
