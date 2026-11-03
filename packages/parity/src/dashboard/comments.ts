import type { TrackerCase, TrackerData } from './tracker.ts';

/** A GitHub issue comment with the fields needed to find the dashboard's prior report. */
export interface IssueComment {
    readonly id: number;
    readonly body: string;
    readonly user: { readonly login: string };
}

/** Finds the newest dashboard comment authored by the workflow bot. */
export const findParityComment = (
    comments: readonly IssueComment[],
    marker: string,
    botLogin = 'github-actions[bot]'
): IssueComment | undefined =>
    comments
        .filter((comment) => comment.user.login === botLogin && comment.body.includes(marker))
        .reduce<IssueComment | undefined>(
            (newest, comment) => (newest === undefined || comment.id > newest.id ? comment : newest),
            undefined
        );

const checkCases = (tracker: TrackerData): readonly TrackerCase[] =>
    tracker.cases.filter((entry) => entry.kind === 'check');

const caseLabel = (entry: TrackerCase, revision: string): string => {
    const title = entry.kind === 'gap' ? `Gap: ${entry.title}` : entry.title;
    const line = entry.line === undefined ? '' : `#L${entry.line}`;
    const url = `https://github.com/JSPrismarine/JSPrismarine/blob/${revision}/${entry.sourceFile}${line}`;
    return `[\`${title.replaceAll('`', "'")}\`](${url}) — ${entry.status}`;
};

/**
 * Renders the compact parity comment posted on a pull request.
 *
 * The comment reports suite totals, summarizes case-count changes by family, and lists only
 * changed outcomes or reviewed gaps. It never expands every row from a changed test file.
 *
 * @param current - Tracker data generated from the pull request head.
 * @param baseline - Tracker data generated from the pull request base.
 * @param revision - Pull request head SHA used in source links.
 * @param trackerUrl - Public docs page for the complete tracker.
 * @returns A Markdown issue comment with only pull-request-relevant case details.
 */
export const renderParityComment = (
    current: TrackerData,
    baseline: TrackerData,
    revision: string,
    trackerUrl: string
): string => {
    const baselineById = new Map(checkCases(baseline).map((entry) => [entry.id, entry]));
    const currentChecks = checkCases(current);
    const currentById = new Map(currentChecks.map((entry) => [entry.id, entry]));
    const usesDataLevelCases = (tracker: TrackerData): boolean =>
        tracker.cases.some((entry) => entry.kind === 'check' && entry.id.startsWith('data:'));
    const caseSchemasMatch =
        currentChecks.length > 0 &&
        baselineById.size > 0 &&
        usesDataLevelCases(current) === usesDataLevelCases(baseline);
    const changedOutcomeCases = currentChecks.filter((entry) => {
        const previous = baselineById.get(entry.id);
        return previous !== undefined && previous.status !== entry.status;
    });
    const addedCases = currentChecks.filter((entry) => !baselineById.has(entry.id));
    const removedCases = [...baselineById.values()].filter((entry) => !currentById.has(entry.id));
    const removedCount = removedCases.length;
    const deltasByFamily = new Map<string, { added: number; removed: number; outcomes: number }>();
    const deltaFor = (family: string): { added: number; removed: number; outcomes: number } => {
        const existing = deltasByFamily.get(family);
        if (existing !== undefined) return existing;
        const created = { added: 0, removed: 0, outcomes: 0 };
        deltasByFamily.set(family, created);
        return created;
    };
    for (const entry of addedCases) deltaFor(entry.family).added += 1;
    for (const entry of removedCases) deltaFor(entry.family).removed += 1;
    for (const entry of changedOutcomeCases) deltaFor(entry.family).outcomes += 1;

    const baselineGaps = new Map(
        baseline.cases.filter((entry) => entry.kind === 'gap').map((entry) => [entry.id, entry])
    );
    const addedOrChangedGaps = current.cases.filter((entry) => {
        if (!caseSchemasMatch || entry.kind !== 'gap') return false;
        const previous = baselineGaps.get(entry.id);
        return previous === undefined || previous.status !== entry.status;
    });
    const caseChanges = [
        `${addedCases.length} added`,
        `${removedCount} removed`,
        `${changedOutcomeCases.length} outcome changes`
    ].join(', ');
    const intentionalDelta = current.intentional - (baseline.intentional ?? 0);
    const deferredDelta = current.deferred - (baseline.deferred ?? 0);
    const defectDelta = current.defects - baseline.defects;
    const signed = (value: number): string => `${value > 0 ? '+' : ''}${value}`;
    const changedCaseList = changedOutcomeCases
        .slice(0, 6)
        .map((entry) => `- **${entry.family}** · ${caseLabel(entry, revision)}`);
    const changedGapList = addedOrChangedGaps
        .slice(0, Math.max(0, 8 - changedCaseList.length))
        .map((entry) => `- **${entry.family}** · ${caseLabel(entry, revision)}`);
    const changeCount = changedOutcomeCases.length + addedOrChangedGaps.length;
    const displayedChangeCount = changedCaseList.length + changedGapList.length;
    const remaining = changeCount - displayedChangeCount;
    const changedFamilies = [...deltasByFamily]
        .filter(([, delta]) => delta.added + delta.removed + delta.outcomes > 0)
        .sort(([left], [right]) => left.localeCompare(right, 'en'));
    const familyChangeList = changedFamilies.slice(0, 8).map(([family, delta]) => {
        const parts = [];
        if (delta.added > 0) parts.push(`+${delta.added} cases`);
        if (delta.removed > 0) parts.push(`−${delta.removed} cases`);
        if (delta.outcomes > 0) parts.push(`${delta.outcomes} outcome changes`);
        return `- **${family}:** ${parts.join(', ')}`;
    });

    return [
        '<!-- jsprismarine-parity-trend -->',
        '## Parity checks',
        `**Current:** ${current.passed}/${current.checks} passing; ${current.failed} failing; ${current.notMeasured} not measured; ${current.intentional} intentional differences; ${current.deferred} deferred; ${current.defects} known defects.`,
        ...(caseSchemasMatch
            ? [
                  `**Compared with base:** ${caseChanges}; intentional differences ${signed(intentionalDelta)}; deferred ${signed(deferredDelta)}; known defects ${signed(defectDelta)}.`
              ]
            : [
                  `**Compared with base:** case-level deltas are unavailable because the base report does not contain comparable case rows; intentional differences ${signed(intentionalDelta)}, deferred ${signed(deferredDelta)}, and known defects ${signed(defectDelta)}.`
              ]),
        ...(caseSchemasMatch
            ? [
                  '### Case changes by family',
                  ...(familyChangeList.length === 0 ? ['No case-count or outcome changes.'] : familyChangeList),
                  ...(changedFamilies.length > familyChangeList.length
                      ? [`- ${changedFamilies.length - familyChangeList.length} more changed families.`]
                      : [])
              ]
            : []),
        '### Changed outcomes and reviewed gaps',
        ...(displayedChangeCount === 0
            ? ['No changed outcomes or reviewed gaps to list.']
            : changedCaseList.concat(changedGapList)),
        ...(remaining > 0 ? [`- ${remaining} more changed outcomes or reviewed gaps.`] : []),
        `[Open the full parity tracker](${trackerUrl}).`
    ].join('\n\n');
};
