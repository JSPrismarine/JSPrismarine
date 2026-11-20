/**
 * The scenario coverage map, and what a change can reach through it.
 *
 * ```
 * node src/scenario-coverage-map.mts <out.json> <map.json>...   # merges the maps, by scenario name
 * ```
 *
 * `scenario-coverage.mts` builds the map from an e2e run's V8 coverage. This module reads and merges maps,
 * and imports nothing outside Node, since the workflow job that selects scenarios has no packages
 * installed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * What ran of one source file. An owner is a scenario's index in {@link ScenarioCoverageMap.scenarios},
 * or `-1` for `always`.
 */
export interface FileCoverage {
    /** Who ran the module's top level, which runs once, when something first imports it. */
    module: number[];
    /**
     * The file's functions, each as its line range and the owners that ran it. A function nobody
     * ran has no owners, so a change inside it reaches no scenario.
     */
    functions: Array<[start: number, end: number, ...owners: number[]]>;
}

/** The map a selection reads: for each source file, which scenarios ran which of its functions. */
export interface ScenarioCoverageMap {
    version: 1;
    scenarios: string[];
    /** Repository-relative paths with forward slashes. */
    files: Record<string, FileCoverage>;
}

/** Owners gathered per file while a map is built: module owners, and owners by `start:end`. */
export type OwnerSets = Map<string, { module: Set<number>; functions: Map<string, Set<number>> }>;

/** Turns gathered owners into the map's files, sorted so equal maps serialize equally. */
export const filesFrom = (owners: OwnerSets): Record<string, FileCoverage> => {
    const sorted = (set: Set<number>): number[] => [...set].sort((a, b) => a - b);
    const files: Record<string, FileCoverage> = {};
    for (const [file, { module, functions }] of [...owners].sort(([a], [b]) => a.localeCompare(b))) {
        files[file] = {
            module: sorted(module),
            functions: [...functions]
                .map(([key, set]): FileCoverage['functions'][number] => {
                    const [start, end] = key.split(':').map(Number);
                    return [start ?? 0, end ?? 0, ...sorted(set)];
                })
                .sort((a, b) => a[0] - b[0] || a[1] - b[1])
        };
    }
    return files;
};

/**
 * Merges the maps of several runs, such as one per shard, by scenario name.
 *
 * @param maps - The maps to merge.
 * @returns One map in which every function holds the owners it had in any of them.
 */
export const mergeScenarioCoverageMaps = (maps: readonly ScenarioCoverageMap[]): ScenarioCoverageMap => {
    const scenarios = [...new Set(maps.flatMap((map) => map.scenarios))];
    const merged: OwnerSets = new Map();
    for (const map of maps) {
        const rename = (owner: number): number => {
            const name = map.scenarios[owner];
            return owner === -1 || name === undefined ? -1 : scenarios.indexOf(name);
        };
        for (const [file, coverage] of Object.entries(map.files)) {
            const entry = merged.get(file) ?? { module: new Set<number>(), functions: new Map() };
            merged.set(file, entry);
            for (const owner of coverage.module) entry.module.add(rename(owner));
            for (const [start, end, ...owners] of coverage.functions) {
                const key = `${start}:${end}`;
                const set = entry.functions.get(key) ?? new Set<number>();
                entry.functions.set(key, set);
                for (const owner of owners) set.add(rename(owner));
            }
        }
    }
    return { version: 1, scenarios, files: filesFrom(merged) };
};

/** A changed range of the base file: its first line and how many lines it replaced. */
export interface Hunk {
    start: number;
    count: number;
}

/**
 * Reads the changed ranges of the base file from a unified diff's hunk headers.
 *
 * @param patch - The diff of one file, as GitHub's pull request files list gives it.
 * @returns One hunk per `@@ -start,count +… @@` header.
 */
export const parseHunks = (patch: string): Hunk[] =>
    [...patch.matchAll(/^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/gm)].map((match) => ({
        start: Number(match[1]),
        count: match[2] === undefined ? 1 : Number(match[2])
    }));

/**
 * Finds the scenarios a change to one source file can reach.
 *
 * A changed line belongs to the innermost function around it, or to the module's top level when no
 * function holds it. A hunk that only adds lines belongs to the lines on either side of it.
 *
 * @param map - The base commit's map.
 * @param file - The file's path in the base commit.
 * @param hunks - The file's changed ranges in the base commit.
 * @returns The scenarios the change reaches, or `'all'` when it reaches code that runs outside
 * every scenario.
 */
export const scenariosReaching = (
    map: ScenarioCoverageMap,
    file: string,
    hunks: readonly Hunk[]
): readonly string[] | 'all' => {
    const coverage = map.files[file];
    // No scenario ran the file, so no scenario reaches a change in it.
    if (coverage === undefined) return [];
    const owners = new Set<number>();
    const ownersOfLine = (line: number): readonly number[] => {
        let innermost: FileCoverage['functions'][number] | undefined;
        for (const fn of coverage.functions) {
            const [start, end] = fn;
            if (start > line || end < line) continue;
            if (innermost === undefined || end - start < innermost[1] - innermost[0]) innermost = fn;
        }
        return innermost === undefined ? coverage.module : innermost.slice(2);
    };
    for (const { start, count } of hunks) {
        const lines = count === 0 ? [start, start + 1] : Array.from({ length: count }, (_, i) => start + i);
        for (const line of lines) for (const owner of ownersOfLine(line)) owners.add(owner);
    }
    if (owners.has(-1)) return 'all';
    return [...owners].flatMap((owner) => {
        const name = map.scenarios[owner];
        return name === undefined ? [] : [name];
    });
};

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [output, ...inputs] = process.argv.slice(2);
    if (output === undefined || inputs.length === 0) throw new Error('usage: scenario-coverage-map.mts <out> <map>...');
    // Parsed JSON boundary: each input is a map scenario-coverage.mts wrote.
    const maps = inputs.map((input) => JSON.parse(fs.readFileSync(input, 'utf8')) as ScenarioCoverageMap);
    const merged = mergeScenarioCoverageMaps(maps);
    fs.writeFileSync(output, `${JSON.stringify(merged)}\n`);
    console.log(
        `merged ${inputs.length} maps: ${merged.scenarios.length} scenarios, ${Object.keys(merged.files).length} files`
    );
}
