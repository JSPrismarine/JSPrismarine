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
