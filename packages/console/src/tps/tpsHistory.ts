/** One TPS reading and when the console received it. */
export interface TpsSample {
    /** Epoch milliseconds. */
    at: number;
    tps: number;
}

/** How far back the console keeps readings; the longest {@link TPS_WINDOWS} entry. */
export const TPS_RETENTION_MS = 15 * 60_000;

/** The spans the TPS page can show, shortest first. */
export const TPS_WINDOWS = [
    { label: '1m', ms: 60_000 },
    { label: '5m', ms: 5 * 60_000 },
    { label: '15m', ms: TPS_RETENTION_MS }
] as const;

/** Min, max, and time-weighted average over a window. */
export interface TpsStats {
    average: number;
    min: number;
    max: number;
}

/** Drops the readings older than {@link TPS_RETENTION_MS}, keeping them in place. */
export function pruneSamples(samples: TpsSample[], now: number): void {
    let stale = 0;
    while (stale < samples.length && now - samples[stale]!.at > TPS_RETENTION_MS) stale += 1;
    if (stale > 0) samples.splice(0, stale);
}

/**
 * Resamples a window into `points` evenly spaced readings, oldest first.
 *
 * Each point is the lowest reading that arrived in its slice of the window, so a short stall is not
 * averaged away. A slice without a reading repeats the last known value, because the server stays
 * silent while its status is unchanged. Slices before the first reading are `undefined`.
 *
 * @param now - End of the window, in epoch milliseconds.
 * @param windowMs - Length of the window.
 */
export function seriesForWindow(
    samples: readonly TpsSample[],
    now: number,
    windowMs: number,
    points: number
): (number | undefined)[] {
    const start = now - windowMs;
    const step = windowMs / points;
    const series = new Array<number | undefined>(points);
    let carry: number | undefined;
    let cursor = 0;
    while (cursor < samples.length && samples[cursor]!.at < start) {
        carry = samples[cursor]!.tps;
        cursor += 1;
    }
    for (let point = 0; point < points; point += 1) {
        const end = point === points - 1 ? Number.POSITIVE_INFINITY : start + (point + 1) * step;
        let low: number | undefined;
        while (cursor < samples.length && samples[cursor]!.at < end) {
            const { tps } = samples[cursor]!;
            low = low === undefined ? tps : Math.min(low, tps);
            carry = tps;
            cursor += 1;
        }
        series[point] = low ?? carry;
    }
    return series;
}

/**
 * Summarizes the readings in the last `windowMs`. Each reading counts for as long as it was the
 * latest one, so the average follows time rather than message count.
 *
 * @returns `undefined` when no reading exists at or before `now`.
 */
export function summarizeWindow(samples: readonly TpsSample[], now: number, windowMs: number): TpsStats | undefined {
    const start = now - windowMs;
    let held: TpsSample | undefined;
    let weighted = 0;
    let covered = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    const hold = (tps: number, from: number, to: number): void => {
        if (to <= from) return;
        min = Math.min(min, tps);
        max = Math.max(max, tps);
        weighted += tps * (to - from);
        covered += to - from;
    };

    for (const sample of samples) {
        if (sample.at > now) break;
        if (held !== undefined) hold(held.tps, Math.max(held.at, start), Math.max(sample.at, start));
        held = sample;
    }
    if (held === undefined) return undefined;
    hold(held.tps, Math.max(held.at, start), now);
    // The latest reading counts even when it arrived at `now` and has held for no time yet.
    min = Math.min(min, held.tps);
    max = Math.max(max, held.tps);

    // A single reading with no elapsed time has no weight, so it stands for itself.
    return { average: covered > 0 ? weighted / covered : held.tps, min, max };
}
