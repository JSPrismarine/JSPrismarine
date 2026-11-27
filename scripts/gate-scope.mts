/**
 * Narrows a whole-repository check to the files the agent lint gate is checking.
 *
 * The gate (`agent-lint-gate.mts`) sets `JSP_LINT_BASE=HEAD` and runs a check only when a changed
 * file is one of its inputs, but a check such as `lint:landmines` still scans every file in the
 * repository. A check whose rules judge each file on its own reads {@link gateScope} and scans just
 * the changed files and their neighbors. `pnpm run lint`, `lint:all` and CI leave
 * `JSP_LINT_BASE` unset, so they keep scanning everything.
 */
import path from 'node:path';

import { changedFiles } from './lint-changed.mts';
import type { Counts } from './rule-baseline.mts';

/**
 * The changed files a gate run checks, or `undefined` for a full scan: outside the gate, with
 * `JSP_LINT_ALL=1`, when Git cannot list the changes, or when a changed file is one of `fullInputs`,
 * such as the check's own script, baseline or configuration.
 *
 * @param root - The repository root.
 * @param fullInputs - Tests a changed path, relative to `root` with forward slashes, for whether it
 *   changes what the check finds in files that did not change.
 */
export const gateScope = (root: string, fullInputs: (file: string) => boolean): string[] | undefined => {
    if (!process.env.JSP_LINT_BASE || process.env.JSP_LINT_ALL === '1') return undefined;
    const changed = changedFiles(root);
    if (changed === undefined || changed.some(fullInputs)) return undefined;
    return [...new Set(changed)].sort();
};

/**
 * The directories of `files`, so a check can scan the neighbors whose findings a change can move,
 * such as a test whose source file was renamed.
 */
export const directoriesOf = (files: readonly string[]): string[] =>
    [...new Set(files.map((file) => path.posix.dirname(file)))].sort();

/**
 * The part of a baseline a scoped scan can confirm: the entries of the scanned files, and of any
 * other file the scan found something in, such as a `package.json` a rule counts its package's
 * findings against. Comparing against the whole baseline would report every file outside the scan
 * as fixed.
 *
 * @param baseline - The full baseline.
 * @param scanned - Whether the scan covered a file, by its baseline key.
 * @param found - What the scoped scan found.
 */
export const scopeBaseline = <Rule extends string>(
    baseline: Counts<Rule>,
    scanned: (file: string) => boolean,
    found: Counts<Rule>
): Counts<Rule> => Object.fromEntries(Object.entries(baseline).filter(([file]) => scanned(file) || file in found));
