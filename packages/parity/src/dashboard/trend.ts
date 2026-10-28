/** The totals row in a rendered parity dashboard. */
export interface DashboardTotals {
    /** Comparisons that ran and passed. */
    readonly passed: number;
    /** Comparisons that ran and found an unreviewed difference. */
    readonly failed: number;
    /** Comparisons skipped because their reference data was unavailable. */
    readonly notMeasured: number;
    /** Differences the project accepts as correct behavior. */
    readonly accepted: number;
    /** Differences recorded as known defects. */
    readonly defects: number;
}

/** A coverage measurement embedded in the dashboard Markdown. */
export interface DashboardMeasurement {
    readonly family: string;
    readonly name: string;
    readonly value: number;
}

/** Reads the totals row the dashboard renderer produces. */
export const parseDashboardTotals = (markdown: string): DashboardTotals => {
    const row = markdown.split(/\r?\n/).find((line) => line.startsWith('| **total** |'));
    if (row === undefined) throw new Error('Parity dashboard has no total row.');

    const columns = row
        .split('|')
        .slice(1, -1)
        .map((column) => column.trim());
    if (columns.length !== 7 || columns[0] !== '**total**') {
        throw new Error(`Parity dashboard total row has an unexpected shape: ${row}`);
    }

    const countAt = (index: number): number => {
        const value = columns[index];
        if (value === undefined || !/^\d+$/.test(value)) {
            throw new Error(`Parity dashboard total row has an invalid count: ${row}`);
        }
        return Number(value);
    };

    return {
        passed: countAt(2),
        failed: countAt(3),
        notMeasured: countAt(4),
        accepted: countAt(5),
        defects: countAt(6)
    };
};

/** Reads the coverage measurement table, or an empty list for a report from before it existed. */
export const parseDashboardMeasurements = (markdown: string): readonly DashboardMeasurement[] => {
    const section = markdown.split(/^## Coverage measurements\s*$/m)[1];
    if (section === undefined) return [];

    return section
        .split(/\r?\n/)
        .filter((line) => line.startsWith('| '))
        .slice(2)
        .map((line) => {
            const columns = line
                .split('|')
                .slice(1, -1)
                .map((column) => column.trim());
            const value = columns[2];
            if (columns.length !== 3 || value === undefined || !/^\d+(?:\.\d+)?$/.test(value)) {
                throw new Error(`Parity dashboard measurement row has an unexpected shape: ${line}`);
            }
            return { family: columns[0] ?? '', name: columns[1] ?? '', value: Number(value) };
        });
};

const openGapsOf = (totals: DashboardTotals): number => totals.failed + totals.defects;

const countChange = (previous: number, current: number): string => {
    const delta = current - previous;
    if (delta === 0) return `${previous} (unchanged)`;
    return `${previous} → ${current} (${delta > 0 ? '+' : ''}${delta})`;
};

/** Describes parity movement since the previous report on the same pull request. */
const coverageTrend = (previous: readonly DashboardMeasurement[], current: readonly DashboardMeasurement[]): string => {
    const previousByKey = new Map(
        previous.map((measurement) => [`${measurement.family}/${measurement.name}`, measurement])
    );
    const currentByKey = new Map(
        current.map((measurement) => [`${measurement.family}/${measurement.name}`, measurement])
    );
    const increased: string[] = [];
    const fell: string[] = [];
    const added: string[] = [];
    const removed: string[] = [];

    for (const [key, measurement] of currentByKey) {
        const old = previousByKey.get(key);
        if (old === undefined) added.push(`${key} ${measurement.value}`);
        else if (measurement.value > old.value) increased.push(`${key} +${measurement.value - old.value}`);
        else if (measurement.value < old.value) fell.push(`${key} ${measurement.value - old.value}`);
    }
    for (const key of previousByKey.keys()) if (!currentByKey.has(key)) removed.push(key);

    const changes = [
        increased.length === 0 ? '' : `increased: ${increased.join(', ')}`,
        fell.length === 0 ? '' : `fell: ${fell.join(', ')}`,
        added.length === 0 ? '' : `added: ${added.join(', ')}`,
        removed.length === 0 ? '' : `removed: ${removed.join(', ')}`
    ].filter((part) => part !== '');

    if (changes.length > 0) return `Coverage measurements ${changes.join('; ')}.`;
    return `Coverage measurements unchanged: ${current.length} tracked values.`;
};

/** Describes parity, accepted-gap, and measured-coverage movement between two reports. */
export const describeParityTrend = (
    previous: DashboardTotals | undefined,
    current: DashboardTotals,
    previousMeasurements: readonly DashboardMeasurement[] = [],
    currentMeasurements: readonly DashboardMeasurement[] = []
): string => {
    const currentGaps = openGapsOf(current);
    if (previous === undefined) {
        const baseline = `Baseline established: ${currentGaps} open gaps (failed comparisons plus known defects).`;
        return currentMeasurements.length === 0
            ? baseline
            : `${baseline}\nCoverage baseline: ${currentMeasurements.length} measured values across ${new Set(currentMeasurements.map((measurement) => measurement.family)).size} families.`;
    }

    const previousGaps = openGapsOf(previous);
    const gapDelta = currentGaps - previousGaps;
    let assessment: string;

    if (gapDelta < 0) assessment = `Parity improved: open gaps fell from ${previousGaps} to ${currentGaps}.`;
    else if (gapDelta > 0) assessment = `Parity regressed: open gaps rose from ${previousGaps} to ${currentGaps}.`;
    else if (current.passed > previous.passed) {
        assessment = `Parity coverage increased: more comparisons passed, with ${currentGaps} open gaps.`;
    } else if (current.passed < previous.passed) {
        assessment = `Parity coverage fell: fewer comparisons passed, with ${currentGaps} open gaps.`;
    } else if (current.notMeasured < previous.notMeasured) {
        assessment = `Measurement coverage increased: fewer comparisons are not measured, with ${currentGaps} open gaps.`;
    } else if (current.notMeasured > previous.notMeasured) {
        assessment = `Measurement coverage fell: more comparisons are not measured, with ${currentGaps} open gaps.`;
    } else assessment = `Parity is unchanged: ${currentGaps} open gaps.`;

    return [
        assessment,
        `Passed: ${countChange(previous.passed, current.passed)}; failed: ${countChange(previous.failed, current.failed)}; not measured: ${countChange(previous.notMeasured, current.notMeasured)}; accepted gaps: ${countChange(previous.accepted, current.accepted)}; known defects: ${countChange(previous.defects, current.defects)}.`,
        coverageTrend(previousMeasurements, currentMeasurements)
    ].join('\n');
};
