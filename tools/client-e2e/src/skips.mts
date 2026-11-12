/**
 * Scenarios a pinned cinnabar build cannot pass through no fault of the server, and the checks
 * that keep each entry honest. The list itself is in `pin-skips.mts`.
 */
import { buildName, isCommit } from './cinnabar.mts';
import type { PinnedVersion } from './cinnabar.mts';

/**
 * One scenario left out on one cinnabar build. A skip names the build's commit, not a protocol,
 * so it follows that client version wherever it is pinned and stops applying when the pin moves.
 */
export interface ScenarioSkip {
    /** The scenario's `name`. */
    scenario: string;
    /** The full cinnabar commit whose build gets the scenario wrong. */
    commit: string;
    reason: {
        /** What the pinned client does wrong: the input it mishandles, the packet it sends or leaves out. */
        client: string;
        /** Why the server is not at fault: the packet log, the unit test or the other client that shows it. */
        server: string;
    };
    /** Links that back the reason: the JSPrismarine issue, the client's fix, an upstream report. */
    references: string[];
    /** The full cinnabar commit that fixes the client, once there is one. */
    fixedIn?: string;
}

/** The fewest words each half of a reason may have: about one full sentence. */
export const MIN_REASON_WORDS = 15;

/** What the validator checks the skips against. */
export interface SkipContext {
    /** The name of every scenario a suite runs. */
    scenarios: readonly string[];
    /** Every `cinnabar.json` version entry. */
    versions: readonly PinnedVersion[];
    /**
     * Whether `ancestor` is `commit` or in its history, or `undefined` when that cannot be told.
     * Without it, only a `fixedIn` equal to the skipped commit counts as fixed.
     */
    contains?: (commit: string, ancestor: string) => boolean | undefined;
}

const wordCount = (text: string): number => text.split(/\s+/).filter((word) => /\w/.test(word)).length;

const PLACEHOLDER = /\b(?:TODO|TBD|FIXME|XXX)\b/;

const isHttpsUrl = (reference: string): boolean => {
    try {
        return new URL(reference).protocol === 'https:';
    } catch {
        return false;
    }
};

/** Checks one half of a reason and says what it is missing. */
const reasonProblem = (text: string, field: string, asks: string): string | undefined => {
    if (PLACEHOLDER.test(text)) return `${field} still holds a placeholder; replace it with ${asks}`;
    const words = wordCount(text);
    if (words < MIN_REASON_WORDS) {
        return `${field} has ${words} words; give ${asks}, in at least ${MIN_REASON_WORDS} words`;
    }
    return undefined;
};

/**
 * Lists what is wrong with each skip, so the next person knows what to add or remove.
 *
 * @param skips - The declared skips.
 * @param context - The scenarios, the pins and, optionally, a way to read the client's history.
 * @returns One message per problem, each naming the entry; empty when every skip holds.
 */
export const skipProblems = (skips: readonly ScenarioSkip[], context: SkipContext): string[] => {
    const pinned = new Set(context.versions.map((version) => version.commit));
    const pins = context.versions.map((version) => `${version.protocol} at ${buildName(version.commit)}`).join(', ');
    const seen = new Set<string>();
    return skips.flatMap((skip, index) => {
        const label = `skip ${index + 1} (${skip.scenario} on cinnabar ${buildName(skip.commit)})`;
        const problems: string[] = [];
        const problem = (message: string): void => {
            problems.push(`${label}: ${message}`);
        };

        if (!context.scenarios.includes(skip.scenario)) {
            problem(`no suite in src/suites.mts runs a scenario named '${skip.scenario}'`);
        }
        const key = `${skip.scenario} ${skip.commit}`;
        if (seen.has(key)) problem('skips the same scenario on the same build as an earlier entry; keep one');
        seen.add(key);

        if (!isCommit(skip.commit)) {
            problem('commit must be the full 40-character cinnabar commit of the build that fails');
        } else if (!pinned.has(skip.commit)) {
            problem(
                `cinnabar.json no longer pins this commit (it pins ${pins}), so the skip no longer applies. ` +
                    'Run the scenario on the new build with --run-skipped: delete the skip if it passes, or ' +
                    'set commit to the new build once you have checked the reason still holds for it'
            );
        }

        const client = reasonProblem(
            skip.reason.client,
            'reason.client',
            'what the pinned client does wrong, such as the input it mishandles or the packet it sends or leaves out'
        );
        if (client !== undefined) problem(client);
        const server = reasonProblem(
            skip.reason.server,
            'reason.server',
            'why the server is not at fault, with the evidence: a packet log, a unit test, another client that passes'
        );
        if (server !== undefined) problem(server);

        if (skip.references.length === 0) {
            problem(
                'add at least one reference: the JSPrismarine issue that tracks the skip, the client commit ' +
                    'or pull request that fixes it, or an upstream report'
            );
        }
        for (const reference of skip.references) {
            if (!isHttpsUrl(reference)) problem(`reference '${reference}' must be an https:// link`);
        }

        if (skip.fixedIn !== undefined) {
            if (!isCommit(skip.fixedIn)) {
                problem('fixedIn must be the full 40-character cinnabar commit that fixes the client');
            } else if (skip.fixedIn === skip.commit || context.contains?.(skip.commit, skip.fixedIn) === true) {
                problem(
                    `the build already contains the fix ${buildName(skip.fixedIn)} (fixedIn), so the skip is ` +
                        'stale: confirm with --run-skipped that the scenario passes, then delete the skip'
                );
            }
        }
        return problems;
    });
};

/** Throws with every problem {@link skipProblems} finds, one per line. */
export const assertSkipsValid = (skips: readonly ScenarioSkip[], context: SkipContext): void => {
    const problems = skipProblems(skips, context);
    if (problems.length > 0) {
        throw new Error(
            `src/pin-skips.mts has ${problems.length} problem(s):\n${problems.map((line) => `  ${line}`).join('\n')}`
        );
    }
};

/** A group of scenarios, as far as skipping reads it. */
interface Suite<S extends { name: string }> {
    name: string;
    scenarios: S[];
}

/**
 * Takes the scenarios one build skips out of the suites.
 *
 * @param suites - The suites selected for the run.
 * @param skips - The declared skips.
 * @param commit - The commit of the build the run uses.
 * @param runSkipped - Run the skipped scenarios anyway, to check whether the build still needs its skips.
 * @returns The suites left to run, without the ones that lost every scenario, and the skips that
 * matched a selected scenario: left out, or run anyway when `runSkipped` is set.
 */
export const applySkips = <S extends { name: string }, T extends Suite<S>>(
    suites: readonly T[],
    skips: readonly ScenarioSkip[],
    commit: string,
    runSkipped: boolean
): { suites: T[]; skipped: ScenarioSkip[] } => {
    const selected = new Set(suites.flatMap((suite) => suite.scenarios.map((scenario) => scenario.name)));
    const skipped = skips.filter((skip) => skip.commit === commit && selected.has(skip.scenario));
    if (runSkipped) return { suites: [...suites], skipped };
    const names = new Set(skipped.map((skip) => skip.scenario));
    return {
        suites: suites
            .map((suite) => ({ ...suite, scenarios: suite.scenarios.filter((scenario) => !names.has(scenario.name)) }))
            .filter((suite) => suite.scenarios.length > 0),
        skipped
    };
};

/** One skip as the run output prints it: the reason on the next lines, then the references. */
export const describeSkip = (skip: ScenarioSkip): string =>
    [
        `client: ${skip.reason.client}`,
        `server: ${skip.reason.server}`,
        `references: ${skip.references.join(' ')}`,
        ...(skip.fixedIn === undefined ? [] : [`fixed in cinnabar ${buildName(skip.fixedIn)}`])
    ].join('\n');
