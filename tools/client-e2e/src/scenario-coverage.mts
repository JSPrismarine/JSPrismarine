/**
 * Which server functions each scenario runs, read from the V8 coverage of an e2e run.
 *
 * The server's coverage hook (`coverage-exit.mjs`) takes a snapshot when the runner signals it,
 * and V8 resets its counts at every snapshot, so a snapshot file holds only what ran since the one
 * before. The runner takes one right before a scenario starts and one right after it ends, so the
 * files of that server between the two hold what the scenario ran. Everything else, boot and the
 * resets between scenarios, other processes and worker threads included, counts as `always`: a
 * change there can reach any scenario.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping';

import type { OwnerSets, ScenarioCoverageMap } from './scenario-coverage-map.mts';
import { filesFrom } from './scenario-coverage-map.mts';

/** A coverage file's place in its process's sequence, read from its name. */
export interface CoverageFileName {
    pid: number;
    timestamp: number;
    sequence: number;
}

/** `coverage-<pid>-<timestamp>-<sequence>.json`, as Node names the files under `NODE_V8_COVERAGE`. */
export const parseCoverageFileName = (name: string): CoverageFileName | undefined => {
    const match = /^coverage-(\d+)-(\d+)-(\d+)\.json$/.exec(name);
    if (!match) return undefined;
    return { pid: Number(match[1]), timestamp: Number(match[2]), sequence: Number(match[3]) };
};

const compareFileNames = (a: CoverageFileName, b: CoverageFileName): number =>
    a.timestamp - b.timestamp || a.sequence - b.sequence;

/** The latest of some coverage files of one process, or `undefined` when none has a coverage name. */
export const newestCoverageFile = (names: readonly string[]): string | undefined =>
    names
        .flatMap((name) => {
            const parsed = parseCoverageFileName(name);
            return parsed === undefined ? [] : [{ name, parsed }];
        })
        .sort((a, b) => compareFileNames(a.parsed, b.parsed))
        .at(-1)?.name;

/** The snapshots a scenario ran between, both files of the same server process. */
export interface ScenarioWindow {
    scenario: string;
    /** The file the snapshot right before the scenario wrote. */
    start: string;
    /** The file the snapshot right after it wrote. */
    end: string;
}

/** What a V8 coverage file says, as far as the map reads it. */
interface V8Coverage {
    result: Array<{
        url: string;
        functions: Array<{ ranges: Array<{ startOffset: number; endOffset: number; count: number }> }>;
    }>;
    'source-map-cache'?: Record<string, { lineLengths: number[]; data: unknown }>;
}

/** Turns an offset into the generated code into a 1-based line and 0-based column. */
const positionAt = (lineStarts: readonly number[], offset: number): { line: number; column: number } => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
        const middle = (low + high + 1) >> 1;
        if ((lineStarts[middle] ?? 0) <= offset) low = middle;
        else high = middle - 1;
    }
    return { line: low + 1, column: offset - (lineStarts[low] ?? 0) };
};

/** Where each generated line starts, from the line lengths Node records beside a source map. */
const lineStartsOf = (lineLengths: readonly number[]): number[] => {
    const starts: number[] = [];
    let offset = 0;
    for (const length of lineLengths) {
        starts.push(offset);
        offset += length + 1;
    }
    return starts;
};

/** A source map, ready to look positions up in. */
interface MappedScript {
    map: TraceMap;
    lineStarts: number[];
}

/**
 * The source lines a function spans, or `undefined` when its ends map to no source line, such as
 * the helpers a transpiler adds.
 */
export const functionLines = (
    script: MappedScript | undefined,
    startOffset: number,
    endOffset: number
): [number, number] | undefined => {
    if (script === undefined) return undefined;
    const start = originalPositionFor(script.map, positionAt(script.lineStarts, startOffset));
    const end = originalPositionFor(script.map, positionAt(script.lineStarts, Math.max(startOffset, endOffset - 1)));
    if (start.line === null || end.line === null) return undefined;
    return start.line <= end.line ? [start.line, end.line] : [end.line, start.line];
};

/**
 * Reads the coverage of one e2e run into a map from source lines to the scenarios that ran them.
 *
 * @param directory - The run's `NODE_V8_COVERAGE` directory.
 * @param windows - The scenario windows the runner recorded.
 * @param repositoryRoot - Files outside `packages/<name>/src/` under it are left out.
 * @returns The map.
 */
export const buildScenarioCoverageMap = (
    directory: string,
    windows: readonly ScenarioWindow[],
    repositoryRoot: string
): ScenarioCoverageMap => {
    const names = fs.readdirSync(directory).flatMap((name) => {
        const parsed = parseCoverageFileName(name);
        return parsed === undefined ? [] : [{ name, ...parsed }];
    });
    const parsedByName = new Map(names.map((entry) => [entry.name, entry]));
    const scenarios = [...new Set(windows.map((window) => window.scenario))];
    const ownerOf = (name: string): number => {
        const file = parsedByName.get(name);
        if (file === undefined) return -1;
        for (const window of windows) {
            const start = parsedByName.get(window.start);
            const end = parsedByName.get(window.end);
            if (start === undefined || end === undefined || start.pid !== file.pid) continue;
            if (compareFileNames(file, start) > 0 && compareFileNames(file, end) <= 0) {
                return scenarios.indexOf(window.scenario);
            }
        }
        return -1;
    };

    const scripts = new Map<string, MappedScript>();
    const owners: OwnerSets = new Map();
    const sourcePattern = /^packages\/[^/]+\/src\//;
    // Node reports resolved paths, such as /private/var on macOS for /var.
    const root = fs.realpathSync(repositoryRoot);
    // One file at a time: each carries the process's whole source map cache, so a shard's worth
    // of snapshots held at once ran the runner out of heap (#3366). Only the maps are kept, once.
    for (const { name } of names) {
        const owner = ownerOf(name);
        // Parsed JSON boundary: Node writes these files in the shape V8Coverage names.
        const coverage = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')) as V8Coverage;
        for (const [url, entry] of Object.entries(coverage['source-map-cache'] ?? {})) {
            if (scripts.has(url)) continue;
            // Parsed JSON boundary: the cache holds the source map exactly as the transpiler wrote it.
            scripts.set(url, {
                map: new TraceMap(entry.data as ConstructorParameters<typeof TraceMap>[0]),
                lineStarts: lineStartsOf(entry.lineLengths)
            });
        }

        for (const script of coverage.result) {
            if (!script.url.startsWith('file://')) continue;
            const relative = path.relative(root, fileURLToPath(script.url)).split(path.sep).join('/');
            if (!sourcePattern.test(relative)) continue;
            const file = owners.get(relative) ?? { module: new Set<number>(), functions: new Map() };
            owners.set(relative, file);
            for (const fn of script.functions) {
                const whole = fn.ranges[0];
                if (whole === undefined) continue;
                // The script itself, starting at its first byte: the module's top level.
                if (whole.startOffset === 0) {
                    if (whole.count > 0) file.module.add(owner);
                    continue;
                }
                const lines = functionLines(scripts.get(script.url), whole.startOffset, whole.endOffset);
                if (lines === undefined) continue;
                const key = `${lines[0]}:${lines[1]}`;
                const set = file.functions.get(key) ?? new Set<number>();
                file.functions.set(key, set);
                // A snapshot also lists functions that never ran, which tells a selection that a
                // change inside one reaches nothing rather than the module's top level.
                if (whole.count > 0) set.add(owner);
            }
        }
    }

    return { version: 1, scenarios, files: filesFrom(owners) };
};
