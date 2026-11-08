/** Counts used by family and group progress bars, including unresolved allow-listed gaps. */
export interface TrackerProgressCounts {
    readonly checks: number;
    readonly deferred: number;
    readonly defects: number;
}

/** Returns measured checks plus deferred work and known defects. */
export const trackerProgressTotal = (counts: TrackerProgressCounts): number =>
    counts.checks + counts.deferred + counts.defects;

/** Formats family or group progress without rounding an incomplete value to 100 percent. */
export const trackerProgressPercent = (passed: number, tracked: number): string => {
    if (tracked <= 0) return '0';
    if (passed >= tracked) return '100';
    const score = (passed / tracked) * 100;
    return (Math.floor(score * 10) / 10).toFixed(1);
};

/** Returns the primary tracked-case pass rate to two decimals without rounding incomplete work to 100 percent. */
export const trackerPrimaryProgressPercent = (passed: number, tracked: number): string => {
    if (tracked <= 0) return '0';
    if (passed >= tracked) return '100';
    const score = ((passed / tracked) * 100).toFixed(2);
    if (Number(score) >= 100) return '99.99';
    return score.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
};

/**
 * The families that measure what the server does in play, as opposed to whether a table it
 * ships matches a reference table.
 *
 * One registry comparison alone holds twelve thousand rows, so a headline over every row mostly
 * reports how well the data tables agree. The behavior score counts only these families, and
 * leaves out the tag and client payload comparisons, which are data tables read through the server.
 */
const BEHAVIOR_FAMILY_PATTERN =
    /^(?:blocks\.behavior|items\.behavior|entities\.behavior|gameplay\..+|integration\.(?:block-behaviors|entity-.+|spawning)|worldgen\..+)$/;

/** Whether a family measures runtime behavior rather than a data table. */
export const isBehaviorFamily = (family: string): boolean => BEHAVIOR_FAMILY_PATTERN.test(family);

/** The counts of the behavior families, summed, for the headline behavior score. */
export const behaviorProgress = (
    families: readonly (TrackerProgressCounts & { readonly id: string; readonly passed: number })[]
): { readonly passed: number; readonly tracked: number } => {
    const behavior = families.filter((family) => isBehaviorFamily(family.id));
    return {
        passed: behavior.reduce((sum, family) => sum + family.passed, 0),
        tracked: behavior.reduce((sum, family) => sum + trackerProgressTotal(family), 0)
    };
};
