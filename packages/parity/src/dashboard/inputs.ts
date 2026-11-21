/**
 * The inputs the dashboard renders from, read from files a test run wrote, and the overlay that
 * builds a complete set from a base commit's inputs and the files a later run re-ran.
 *
 * A CI shard runs only the files its changes reach and keeps three things: Vitest's JSON report,
 * the parity measurements (`PARITY_PROGRESS_FILE`) and the data-level cases
 * (`PARITY_CASES_DIRECTORY`). The dashboard job starts from the base commit's complete inputs and
 * replaces, file by file, what the shards ran. A file `--changed` left out is one the diff cannot
 * reach, so its base result still holds; a file that is gone from the checkout is dropped.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { familyOf, isFamily } from '../families.ts';
import { isRecord } from '../isRecord.ts';
import type { ParityMeasurement } from '../progress.ts';
import type { ReportedFile, VitestJsonReport } from './render.ts';
import type { ReportedParityCase } from './tracker.ts';

/** Everything `renderDashboard` and `buildTrackerData` read. */
export interface DashboardInputs {
    report: VitestJsonReport;
    measurements: ParityMeasurement[];
    cases: ReportedParityCase[];
}

/** The parity package's directory, relative to the repository root, with forward slashes. */
const PARITY_ROOT = 'packages/parity/';

/**
 * Makes a path the test runner reported repository-relative with forward slashes, whatever
 * directory the run started from.
 *
 * @param name - A test file as Vitest's JSON report names it, or a case's `sourceFile`.
 * @returns `packages/parity/...`, or `undefined` for a file outside the parity package.
 */
export const parityPath = (name: string): string | undefined => {
    const slashes = name.replaceAll('\\', '/');
    const index = slashes.lastIndexOf(PARITY_ROOT);
    if (index === -1) return undefined;
    return slashes.slice(index);
};

const isParityMeasurement = (value: unknown): value is ParityMeasurement =>
    isRecord(value) &&
    typeof value.family === 'string' &&
    isFamily(value.family) &&
    typeof value.name === 'string' &&
    typeof value.value === 'number' &&
    Number.isFinite(value.value);

const isTrackerStatus = (value: unknown): value is ReportedParityCase['status'] =>
    value === 'passed' || value === 'failed' || value === 'not measured' || value === 'defect' || value === 'deferred';

const isParityCase = (value: unknown): value is ReportedParityCase =>
    isRecord(value) &&
    typeof value.family === 'string' &&
    isFamily(value.family) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    isTrackerStatus(value.status) &&
    typeof value.sourceFile === 'string' &&
    (value.context === undefined || typeof value.context === 'string') &&
    (value.details === undefined || typeof value.details === 'string') &&
    (value.annotates === undefined || typeof value.annotates === 'boolean');

const isReportedFile = (value: unknown): value is ReportedFile =>
    isRecord(value) && typeof value.name === 'string' && Array.isArray(value.assertionResults);

const jsonLines = (path: string): unknown[] =>
    existsSync(path)
        ? readFileSync(path, 'utf-8')
              .split(/\r?\n/)
              .filter((line) => line !== '')
              .map((line): unknown => JSON.parse(line))
        : [];

/**
 * Reads one run's inputs from a directory: `report.json`, `progress.jsonl` and `cases/*.jsonl`.
 * A missing file reads as empty. Only the parity package's test files are kept, with
 * repository-relative names, so a shard's report of every package it ran narrows to what the
 * dashboard reads.
 *
 * @param directory - Where the run wrote them.
 * @returns The inputs; a record of an unexpected shape throws.
 */
export const readInputs = (directory: string): DashboardInputs => {
    const reportPath = join(directory, 'report.json');
    // Parsed JSON boundary: Vitest's JSON reporter wrote the file.
    const raw: unknown = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf-8')) : { testResults: [] };
    if (!isRecord(raw) || !Array.isArray(raw.testResults)) throw new Error(`${reportPath} is not a Vitest JSON report`);
    const testResults: ReportedFile[] = [];
    for (const file of raw.testResults) {
        if (!isReportedFile(file)) throw new Error(`${reportPath} holds a test file record of an unexpected shape`);
        const name = parityPath(file.name);
        if (name !== undefined) testResults.push({ ...file, name });
    }
    const measurements = jsonLines(join(directory, 'progress.jsonl')).map((value) => {
        if (!isParityMeasurement(value)) throw new Error(`Invalid parity measurement: ${JSON.stringify(value)}`);
        return value;
    });
    const casesDirectory = join(directory, 'cases');
    const cases = (existsSync(casesDirectory) ? readdirSync(casesDirectory) : [])
        .filter((name) => name.endsWith('.jsonl'))
        .sort()
        .flatMap((name) => jsonLines(join(casesDirectory, name)))
        .map((value) => {
            if (!isParityCase(value)) throw new Error(`Invalid parity case record: ${JSON.stringify(value)}`);
            return { ...value, sourceFile: parityPath(value.sourceFile) ?? value.sourceFile };
        });
    return { report: { testResults }, measurements, cases };
};

/**
 * Writes inputs the way `readInputs` reads them, so a run's complete inputs can be kept for the
 * runs based on it. Case files already in the directory are replaced, since `readInputs` reads
 * every one it finds.
 *
 * @param directory - Created if missing.
 * @param inputs - What to write.
 */
export const writeInputs = (directory: string, inputs: DashboardInputs): void => {
    rmSync(join(directory, 'cases'), { recursive: true, force: true });
    mkdirSync(join(directory, 'cases'), { recursive: true });
    writeFileSync(join(directory, 'report.json'), `${JSON.stringify(inputs.report)}\n`);
    writeFileSync(
        join(directory, 'progress.jsonl'),
        inputs.measurements.map((measurement) => `${JSON.stringify(measurement)}\n`).join('')
    );
    writeFileSync(
        join(directory, 'cases', 'cases.jsonl'),
        inputs.cases.map((entry) => `${JSON.stringify(entry)}\n`).join('')
    );
};

/** The families a test file's assertions claim, by their outermost describe title. */
const familiesOf = (file: ReportedFile): Set<string> => {
    const families = new Set<string>();
    for (const test of file.assertionResults) {
        const family = familyOf(test.ancestorTitles[0] ?? '');
        if (family !== undefined) families.add(family);
    }
    return families;
};

/**
 * Merges the inputs of several shards of one run. Each file ran in one shard, so the files are
 * concatenated; a file reported twice keeps the later report.
 *
 * @param shards - One run's shards, in any order.
 * @returns One set of inputs.
 */
export const mergeInputs = (shards: readonly DashboardInputs[]): DashboardInputs => {
    const files = new Map<string, ReportedFile>();
    for (const shard of shards) for (const file of shard.report.testResults) files.set(file.name, file);
    return {
        report: { testResults: [...files.values()].sort((a, b) => a.name.localeCompare(b.name)) },
        measurements: shards.flatMap((shard) => shard.measurements),
        cases: shards.flatMap((shard) => shard.cases)
    };
};

/**
 * Builds a run's complete inputs from the base commit's and what the run re-ran.
 *
 * A file the run reported replaces the base's report of it, its data-level cases, and the
 * measurements of the families its assertions claim. A base file that is gone from the checkout
 * is dropped, cases and all, and a base measurement stays only while a kept file still claims its
 * family, so a family whose last test was removed does not keep its base results. Everything else
 * keeps the base result: `--changed` left it out because the diff cannot reach it, and a change to
 * the data inputs reruns every file through `forceRerunTriggers`.
 *
 * @param base - The base commit's complete inputs.
 * @param update - What the run re-ran, every shard merged.
 * @param exists - Whether a test file, repository-relative, is in the checkout.
 * @returns The run's complete inputs, files sorted by name.
 */
export const overlayInputs = (
    base: DashboardInputs,
    update: DashboardInputs,
    exists: (file: string) => boolean
): DashboardInputs => {
    const rerun = new Set(update.report.testResults.map((file) => file.name));
    const keptFiles = base.report.testResults.filter((file) => exists(file.name) && !rerun.has(file.name));
    const kept = new Set(keptFiles.map((file) => file.name));
    const keptFamilies = new Set(keptFiles.flatMap((file) => [...familiesOf(file)]));
    const rerunFamilies = new Set(update.report.testResults.flatMap((file) => [...familiesOf(file)]));
    return {
        report: {
            testResults: [...keptFiles, ...update.report.testResults].sort((a, b) => a.name.localeCompare(b.name))
        },
        measurements: [
            ...base.measurements.filter(
                (measurement) => keptFamilies.has(measurement.family) && !rerunFamilies.has(measurement.family)
            ),
            ...update.measurements
        ],
        cases: [...base.cases.filter((entry) => kept.has(entry.sourceFile)), ...update.cases]
    };
};
