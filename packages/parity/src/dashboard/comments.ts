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
 * The comment reports suite totals and limits the case list to changed parity files or cases
 * whose outcome differs from the base report.
 *
 * @param current - Tracker data generated from the pull request head.
 * @param baseline - Tracker data generated from the pull request base.
 * @param changedFiles - Repository-relative files changed by the pull request.
 * @param revision - Pull request head SHA used in source links.
 * @param trackerUrl - Public docs page for the complete tracker.
 * @returns A Markdown issue comment with only pull-request-relevant case details.
 */
export const renderParityComment = (
    current: TrackerData,
    baseline: TrackerData,
    changedFiles: readonly string[],
    revision: string,
    trackerUrl: string
): string => {
    const baselineById = new Map(checkCases(baseline).map((entry) => [entry.id, entry]));
    const currentChecks = checkCases(current);
    const currentById = new Map(currentChecks.map((entry) => [entry.id, entry]));
    const usesDataLevelCases = (tracker: TrackerData): boolean =>
        tracker.cases.some((entry) => entry.kind === 'check' && entry.id.startsWith('data:'));
    const caseSchemasMatch = usesDataLevelCases(current) === usesDataLevelCases(baseline);
    const changedOutcomeCases = currentChecks.filter((entry) => {
        const previous = baselineById.get(entry.id);
        return previous !== undefined && previous.status !== entry.status;
    });
    const addedCases = currentChecks.filter((entry) => !baselineById.has(entry.id));
    const removedCount = [...baselineById.keys()].filter((id) => !currentById.has(id)).length;
    const touchedFiles = new Set(changedFiles);
    const touchedCases = current.cases.filter((entry) => touchedFiles.has(entry.sourceFile));
    const relevantCases = [
        ...new Map([...changedOutcomeCases, ...touchedCases].map((entry) => [entry.id, entry])).values()
    ];
    const caseChanges = [
        `${addedCases.length} added`,
        `${removedCount} removed`,
        `${changedOutcomeCases.length} outcome changes`
    ].join(', ');
    const intentionalDelta = current.intentional - (baseline.intentional ?? 0);
    const deferredDelta = current.deferred - (baseline.deferred ?? 0);
    const defectDelta = current.defects - baseline.defects;
    const signed = (value: number): string => `${value > 0 ? '+' : ''}${value}`;
    const caseList = relevantCases.slice(0, 12).map((entry) => `- **${entry.family}** · ${caseLabel(entry, revision)}`);
    const remaining = relevantCases.length - caseList.length;

    return [
        '<!-- jsprismarine-parity-trend -->',
        '## Parity checks',
        `**Current:** ${current.passed}/${current.checks} passing; ${current.failed} failing; ${current.notMeasured} not measured; ${current.intentional} intentional differences; ${current.deferred} deferred; ${current.defects} known defects.`,
        ...(caseSchemasMatch
            ? [
                  `**Compared with base:** ${caseChanges}; intentional differences ${signed(intentionalDelta)}; deferred ${signed(deferredDelta)}; known defects ${signed(defectDelta)}.`
              ]
            : [
                  '**Compared with base:** case deltas will be available after the base branch uses data-level tracking.'
              ]),
        '### Cases touched by this PR',
        ...(caseList.length === 0 ? ['No parity case changes to list.'] : caseList),
        ...(remaining > 0 ? [`- ${remaining} more relevant cases.`] : []),
        `[Open the full parity tracker](${trackerUrl}).`
    ].join('\n\n');
};
