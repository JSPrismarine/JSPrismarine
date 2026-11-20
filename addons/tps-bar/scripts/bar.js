/**
 * What the TPS bar shows for the server's figures. Nothing here imports a module, so the docs
 * build reads the thresholds from this file too.
 */

/** TPS at or above the first is green, at or above the second gold, and below it red. */
export const TPS_LEVELS = [19.5, 15];
/** MSPT below the first is green, below the second gold, and at or above it red. */
export const MSPT_LEVELS = [25, 50];
/** The milliseconds a tick has at 20 TPS. MSPT at or above it fills the bar. */
export const TICK_BUDGET_MS = 50;

/** The color code of the labels, and of a number at each level, best first. */
const LABEL = '§7';
const LEVEL_TEXT = ['§a', '§6', '§c'];
/** The bar's color at each level, best first. */
const LEVEL_BAR = ['green', 'yellow', 'red'];

/** How many of the thresholds a number misses, so 0 is green and 2 is red. */
const tpsLevel = (tps) => TPS_LEVELS.filter((least) => tps < least).length;
const msptLevel = (mspt) => MSPT_LEVELS.filter((below) => mspt >= below).length;

/**
 * The boss bar options for the server's performance and the player's ping.
 *
 * MSPT is `averageTickMs`, the moving average over the last ten or so ticks. The bar redraws once
 * a second, and `lastTickMs` would show whichever tick came last, so one slow tick (a save, a
 * garbage collection) would turn the bar red for a second and a quiet one would hide a slow run.
 * @param performance - `performance` from `@jsprismarine/server`.
 * @param ping - The player's round trip time in milliseconds, or undefined when it is unknown.
 * @returns The text, progress and color to show.
 */
export const barOptions = ({ tps, averageTickMs: mspt }, ping) => {
    const tpsAt = tpsLevel(tps);
    const msptAt = msptLevel(mspt);
    const pingText = ping === undefined ? `${LABEL}?` : `${LEVEL_TEXT[0]}${Math.round(ping)}`;
    return {
        text:
            `${LABEL}TPS: ${LEVEL_TEXT[tpsAt]}${tps.toFixed(2)} ` +
            `${LABEL}MSPT: ${LEVEL_TEXT[msptAt]}${mspt.toFixed(2)} ` +
            `${LABEL}Ping: ${pingText}${LABEL}ms`,
        progress: Math.min(mspt / TICK_BUDGET_MS, 1),
        color: LEVEL_BAR[Math.max(tpsAt, msptAt)]
    };
};
