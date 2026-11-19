/**
 * The mechanical delta between two Java Edition releases' generated data, computed from two
 * in-memory file trees and rendered as Markdown. `diff.ts` reads the trees out of the cache;
 * everything here is pure so the tests can build small trees by hand.
 *
 * The delta is the starting point of a release's research note (step 3 of the java-bringup
 * skill). It lists what moved, and the note says why.
 */
import { isRecord } from '../isRecord.ts';

/** One release's generated data, as file contents keyed by path. */
export interface JavaGeneratedTree {
    /** The release id, such as `26.3`. */
    readonly release: string;
    /**
     * Files of the vanilla datapack, keyed by their path from the datapack root, such as
     * `data/minecraft/loot_table/blocks/stone.json` and `version.json`.
     */
    readonly datapack: ReadonlyMap<string, string>;
    /** Files of the data reports, keyed by their path from `reports/`, such as `registries.json`. */
    readonly reports: ReadonlyMap<string, string>;
}

/** Added and removed members of one set. */
export interface SetDelta {
    readonly added: readonly string[];
    readonly removed: readonly string[];
}

/** A directory that moved: removed under one name and added under another holding mostly the same files. */
export interface DirectoryRename {
    readonly from: string;
    readonly to: string;
    /** The share of file names the two directories have in common, from 0 to 1. */
    readonly overlap: number;
}

/** Directory changes under `data/minecraft/`, each reported at its topmost changed directory. */
export interface DirectoryDelta extends SetDelta {
    readonly renamed: readonly DirectoryRename[];
}

/** Added and removed entries of one registry in `registries.json`. */
export interface RegistryEntryDelta extends SetDelta {
    readonly registry: string;
}

/** A JSON key path and how many files of a registry directory carry it. */
export interface KeyCount {
    readonly path: string;
    readonly files: number;
}

/** JSON key paths that appeared in or disappeared from one registry directory's files. */
export interface KeyDelta {
    readonly directory: string;
    readonly added: readonly KeyCount[];
    readonly removed: readonly KeyCount[];
}

/** A block in `blocks.json` and how many states it has. */
export interface BlockStates {
    readonly id: string;
    readonly states: number;
}

/** Block changes from `blocks.json`. */
export interface BlockDelta {
    readonly added: readonly BlockStates[];
    readonly removed: readonly string[];
    /** Blocks on both sides whose state count changed. */
    readonly stateCountChanged: readonly { readonly id: string; readonly from: number; readonly to: number }[];
}

/** Everything the mechanical diff reports between two releases. */
export interface JavaDataDelta {
    readonly from: string;
    readonly to: string;
    readonly directories: DirectoryDelta;
    readonly registries: SetDelta;
    readonly registryEntries: readonly RegistryEntryDelta[];
    readonly keys: readonly KeyDelta[];
    readonly blocks: BlockDelta;
    readonly items: SetDelta;
    readonly entityTypes: SetDelta;
    /** The two `version.json` records, flattened to `key -> value`. */
    readonly version: {
        readonly from: Readonly<Record<string, string>>;
        readonly to: Readonly<Record<string, string>>;
    };
}

/** The directory every vanilla definition lives under. */
const DATA_ROOT = 'data/minecraft/';

/**
 * Directories under `data/minecraft/` that group registries rather than being one: `worldgen/biome`
 * and `tags/block` are registries of their own, and `datapacks/<name>` is a built-in feature pack.
 */
const GROUPING_DIRECTORIES = new Set(['worldgen', 'tags', 'datapacks']);

/** Key paths are sampled to this many object levels; arrays do not count as a level. */
const KEY_DEPTH = 3;

/** The least share of file names two directories must share to count as a rename. */
const RENAME_OVERLAP = 0.5;

const sorted = (values: Iterable<string>): string[] => [...values].sort();

const setDelta = (from: ReadonlySet<string>, to: ReadonlySet<string>): SetDelta => ({
    added: sorted([...to].filter((value) => !from.has(value))),
    removed: sorted([...from].filter((value) => !to.has(value)))
});

/** Paths of the definition files under `data/minecraft/`, relative to it. */
const definitionPaths = (tree: JavaGeneratedTree): string[] =>
    [...tree.datapack.keys()].filter((path) => path.startsWith(DATA_ROOT)).map((path) => path.slice(DATA_ROOT.length));

/** Every directory that holds a file, at any depth, relative to `data/minecraft/`. */
const directoriesOf = (paths: readonly string[]): Set<string> => {
    const directories = new Set<string>();
    for (const path of paths) {
        const segments = path.split('/');
        for (let depth = 1; depth < segments.length; depth += 1) directories.add(segments.slice(0, depth).join('/'));
    }
    return directories;
};

/** Directories whose parent is not in the set too, so a moved tree is reported once. */
const topmost = (directories: readonly string[]): string[] => {
    const set = new Set(directories);
    return directories.filter((directory) => {
        const slash = directory.lastIndexOf('/');
        return slash < 0 || !set.has(directory.slice(0, slash));
    });
};

/** The file paths under a directory, relative to it. */
const filesUnder = (paths: readonly string[], directory: string): Set<string> =>
    new Set(paths.filter((path) => path.startsWith(`${directory}/`)).map((path) => path.slice(directory.length + 1)));

const overlapOf = (a: ReadonlySet<string>, b: ReadonlySet<string>): number => {
    const shared = [...a].filter((name) => b.has(name)).length;
    const union = new Set([...a, ...b]).size;
    return union === 0 ? 0 : shared / union;
};

/**
 * Added, removed and renamed directories under `data/minecraft/`. A rename is a removed and an
 * added directory whose file names overlap by at least half; each directory pairs at most once,
 * best overlap first.
 *
 * @param from - The older release's tree.
 * @param to - The newer release's tree.
 * @returns The changes, each at its topmost changed directory.
 */
export const diffDirectories = (from: JavaGeneratedTree, to: JavaGeneratedTree): DirectoryDelta => {
    const fromPaths = definitionPaths(from);
    const toPaths = definitionPaths(to);
    const { added, removed } = setDelta(directoriesOf(fromPaths), directoriesOf(toPaths));
    const addedTop = topmost(added);
    const removedTop = topmost(removed);

    const candidates: DirectoryRename[] = [];
    for (const old of removedTop) {
        const oldFiles = filesUnder(fromPaths, old);
        for (const current of addedTop) {
            const overlap = overlapOf(oldFiles, filesUnder(toPaths, current));
            if (overlap >= RENAME_OVERLAP) candidates.push({ from: old, to: current, overlap });
        }
    }
    candidates.sort((a, b) => b.overlap - a.overlap || a.from.localeCompare(b.from));

    const renamed: DirectoryRename[] = [];
    const paired = new Set<string>();
    for (const candidate of candidates) {
        if (paired.has(`-${candidate.from}`) || paired.has(`+${candidate.to}`)) continue;
        paired.add(`-${candidate.from}`);
        paired.add(`+${candidate.to}`);
        renamed.push(candidate);
    }

    return {
        added: addedTop.filter((directory) => !paired.has(`+${directory}`)),
        removed: removedTop.filter((directory) => !paired.has(`-${directory}`)),
        renamed: renamed.sort((a, b) => a.from.localeCompare(b.from))
    };
};

/** `registries.json`'s entries per registry, or an empty map when the report is absent. */
const registryEntries = (tree: JavaGeneratedTree): Map<string, Set<string>> => {
    const text = tree.reports.get('registries.json');
    const registries = new Map<string, Set<string>>();
    if (text === undefined) return registries;
    // A data generator report: parsed JSON whose shape is checked field by field below.
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) return registries;
    for (const [registry, body] of Object.entries(parsed)) {
        const entries = isRecord(body) && isRecord(body.entries) ? Object.keys(body.entries) : [];
        registries.set(registry, new Set(entries));
    }
    return registries;
};

const EMPTY: ReadonlySet<string> = new Set();

/**
 * Added and removed registries, and added and removed entries per registry, from `registries.json`.
 *
 * @param from - The older release's tree.
 * @param to - The newer release's tree.
 * @returns The registry set's delta and one entry delta per registry that changed.
 */
export const diffRegistries = (
    from: JavaGeneratedTree,
    to: JavaGeneratedTree
): { registries: SetDelta; entries: RegistryEntryDelta[] } => {
    const old = registryEntries(from);
    const current = registryEntries(to);
    const entries: RegistryEntryDelta[] = [];
    for (const registry of sorted(new Set([...old.keys(), ...current.keys()]))) {
        const delta = setDelta(old.get(registry) ?? EMPTY, current.get(registry) ?? EMPTY);
        if (delta.added.length > 0 || delta.removed.length > 0) entries.push({ registry, ...delta });
    }
    return { registries: setDelta(new Set(old.keys()), new Set(current.keys())), entries };
};

/**
 * The registry directory a definition belongs to: its first segment, or its first two under a
 * grouping directory such as `worldgen`.
 */
const registryDirectoryOf = (path: string): string | undefined => {
    const segments = path.split('/');
    if (segments.length < 2) return undefined;
    const first = segments[0]!;
    if (GROUPING_DIRECTORIES.has(first)) return segments.length < 3 ? undefined : `${first}/${segments[1]}`;
    return first;
};

/**
 * The object key paths in a JSON value, to {@link KEY_DEPTH} levels. Array elements share their
 * array's path with a `[]` suffix, so `pools[].entries[].type` is a depth-three path.
 *
 * @param value - Parsed JSON.
 * @returns The distinct key paths.
 */
export const keyPaths = (value: unknown): Set<string> => {
    const paths = new Set<string>();
    const visit = (node: unknown, prefix: string, depth: number): void => {
        if (Array.isArray(node)) {
            for (const element of node) visit(element, prefix === '' ? prefix : `${prefix}[]`, depth);
            return;
        }
        if (!isRecord(node) || depth >= KEY_DEPTH) return;
        for (const [key, child] of Object.entries(node)) {
            const path = prefix === '' ? key : `${prefix}.${key}`;
            paths.add(path);
            visit(child, path, depth + 1);
        }
    };
    visit(value, '', 0);
    return paths;
};

/** For each registry directory, how many of its JSON files carry each key path. */
const keyCounts = (tree: JavaGeneratedTree): Map<string, Map<string, number>> => {
    const counts = new Map<string, Map<string, number>>();
    for (const [path, text] of tree.datapack) {
        if (!path.startsWith(DATA_ROOT) || !path.endsWith('.json')) continue;
        const directory = registryDirectoryOf(path.slice(DATA_ROOT.length));
        if (directory === undefined) continue;
        let perDirectory = counts.get(directory);
        if (perDirectory === undefined) {
            perDirectory = new Map();
            counts.set(directory, perDirectory);
        }
        // Generated game data: parsed, and only its key names are read.
        for (const key of keyPaths(JSON.parse(text))) perDirectory.set(key, (perDirectory.get(key) ?? 0) + 1);
    }
    return counts;
};

/**
 * Key paths that appeared in or disappeared from each registry directory, sampled over every file
 * of the directory on each side.
 *
 * @param from - The older release's tree.
 * @param to - The newer release's tree.
 * @returns One delta per directory where a key path changed, with each path's file count on the
 * side that has it.
 */
export const diffKeys = (from: JavaGeneratedTree, to: JavaGeneratedTree): KeyDelta[] => {
    const old = keyCounts(from);
    const current = keyCounts(to);
    const deltas: KeyDelta[] = [];
    for (const directory of sorted(new Set([...old.keys(), ...current.keys()]))) {
        const oldKeys = old.get(directory) ?? new Map<string, number>();
        const newKeys = current.get(directory) ?? new Map<string, number>();
        const { added, removed } = setDelta(new Set(oldKeys.keys()), new Set(newKeys.keys()));
        if (added.length === 0 && removed.length === 0) continue;
        deltas.push({
            directory,
            added: added.map((path) => ({ path, files: newKeys.get(path) ?? 0 })),
            removed: removed.map((path) => ({ path, files: oldKeys.get(path) ?? 0 }))
        });
    }
    return deltas;
};

/** State counts per block from `blocks.json`. */
const blockStates = (tree: JavaGeneratedTree): Map<string, number> => {
    const text = tree.reports.get('blocks.json');
    const blocks = new Map<string, number>();
    if (text === undefined) return blocks;
    // A data generator report: parsed JSON whose shape is checked field by field below.
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) return blocks;
    for (const [id, body] of Object.entries(parsed)) {
        blocks.set(id, isRecord(body) && Array.isArray(body.states) ? body.states.length : 0);
    }
    return blocks;
};

/**
 * New, removed and reshaped blocks from `blocks.json`.
 *
 * @param from - The older release's tree.
 * @param to - The newer release's tree.
 * @returns The block delta, with state counts.
 */
export const diffBlocks = (from: JavaGeneratedTree, to: JavaGeneratedTree): BlockDelta => {
    const old = blockStates(from);
    const current = blockStates(to);
    const { added, removed } = setDelta(new Set(old.keys()), new Set(current.keys()));
    const stateCountChanged = sorted(current.keys())
        .filter((id) => old.has(id) && old.get(id) !== current.get(id))
        .map((id) => ({ id, from: old.get(id) ?? 0, to: current.get(id) ?? 0 }));
    return { added: added.map((id) => ({ id, states: current.get(id) ?? 0 })), removed, stateCountChanged };
};

/** `version.json` flattened to strings, so two records line up row by row. */
const versionRecord = (tree: JavaGeneratedTree): Record<string, string> => {
    const text = tree.datapack.get('version.json');
    if (text === undefined) return {};
    // The record `datagen:java` writes: parsed JSON, read key by key.
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) return {};
    return Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)])
    );
};

/**
 * The whole mechanical delta between two releases' generated data.
 *
 * @param from - The older release's tree.
 * @param to - The newer release's tree.
 * @returns Every section the Markdown report prints.
 */
export const diffJavaData = (from: JavaGeneratedTree, to: JavaGeneratedTree): JavaDataDelta => {
    const registries = diffRegistries(from, to);
    const entriesOf = (registry: string): SetDelta => {
        const found = registries.entries.find((delta) => delta.registry === registry);
        return { added: found?.added ?? [], removed: found?.removed ?? [] };
    };
    return {
        from: from.release,
        to: to.release,
        directories: diffDirectories(from, to),
        registries: registries.registries,
        registryEntries: registries.entries,
        keys: diffKeys(from, to),
        blocks: diffBlocks(from, to),
        items: entriesOf('minecraft:item'),
        entityTypes: entriesOf('minecraft:entity_type'),
        version: { from: versionRecord(from), to: versionRecord(to) }
    };
};

const code = (value: string): string => `\`${value}\``;

const bulletList = (values: readonly string[]): string[] =>
    values.length === 0 ? ['None.'] : values.map((value) => `- ${value}`);

/**
 * Renders a delta as Markdown, one section per kind of change. A section with nothing in it says
 * `None.`, so an empty delta is still a complete report.
 *
 * @param delta - What {@link diffJavaData} returned.
 * @returns The report, ending in a newline.
 */
export const renderJavaDataDelta = (delta: JavaDataDelta): string => {
    const lines: string[] = [`# Java ${delta.from} to ${delta.to} data delta`, ''];
    const section = (title: string, body: readonly string[]): void => {
        lines.push(`## ${title}`, '', ...body, '');
    };

    const versionKeys = sorted(new Set([...Object.keys(delta.version.from), ...Object.keys(delta.version.to)]));
    section(
        'version.json',
        versionKeys.length === 0
            ? ['Neither release has a `version.json`.']
            : [
                  `| Key | ${delta.from} | ${delta.to} |`,
                  '| --- | --- | --- |',
                  ...versionKeys.map(
                      (key) => `| ${key} | ${delta.version.from[key] ?? '-'} | ${delta.version.to[key] ?? '-'} |`
                  )
              ]
    );

    const { directories } = delta;
    section('Directories under data/minecraft/', [
        '### Added',
        '',
        ...bulletList(directories.added.map(code)),
        '',
        '### Removed',
        '',
        ...bulletList(directories.removed.map(code)),
        '',
        '### Renamed',
        '',
        ...bulletList(
            directories.renamed.map(
                (rename) =>
                    `${code(rename.from)} to ${code(rename.to)} (${Math.round(rename.overlap * 100)}% of file names shared)`
            )
        )
    ]);

    section('Registries', [
        '### Added',
        '',
        ...bulletList(delta.registries.added.map(code)),
        '',
        '### Removed',
        '',
        ...bulletList(delta.registries.removed.map(code))
    ]);

    section(
        'Registry entries',
        delta.registryEntries.length === 0
            ? ['None.']
            : delta.registryEntries.flatMap((entry) => [
                  `### ${code(entry.registry)}`,
                  '',
                  ...entry.added.map((id) => `- added ${code(id)}`),
                  ...entry.removed.map((id) => `- removed ${code(id)}`),
                  ''
              ])
    );

    section(
        'JSON keys per registry directory',
        delta.keys.length === 0
            ? ['None.']
            : delta.keys.flatMap((entry) => [
                  `### ${code(entry.directory)}`,
                  '',
                  ...entry.added.map((key) => `- added ${code(key.path)} (${key.files} files)`),
                  ...entry.removed.map((key) => `- removed ${code(key.path)} (${key.files} files)`),
                  ''
              ])
    );

    section('Blocks', [
        '### New',
        '',
        ...bulletList(delta.blocks.added.map((block) => `${code(block.id)}: ${block.states} states`)),
        '',
        '### Removed',
        '',
        ...bulletList(delta.blocks.removed.map(code)),
        '',
        '### State count changed',
        '',
        ...bulletList(delta.blocks.stateCountChanged.map((block) => `${code(block.id)}: ${block.from} to ${block.to}`))
    ]);

    section('Items', [
        '### New',
        '',
        ...bulletList(delta.items.added.map(code)),
        '',
        '### Removed',
        '',
        ...bulletList(delta.items.removed.map(code))
    ]);

    section('Entity types', [
        '### New',
        '',
        ...bulletList(delta.entityTypes.added.map(code)),
        '',
        '### Removed',
        '',
        ...bulletList(delta.entityTypes.removed.map(code))
    ]);

    // Collapse the blank lines sections leave behind into one.
    return `${lines
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trimEnd()}\n`;
};
