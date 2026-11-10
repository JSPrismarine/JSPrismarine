/**
 * Chooses the scenarios a pull request has to run, from the files it changed.
 *
 * Usage, with one changed path per line on standard input:
 * gh api --paginate "repos/$REPO/pulls/$NUMBER/files" --jq '.[].filename' | node src/select.mts
 *
 * Every scenario boots the whole server, so a change to anything the server can load runs them
 * all. Two kinds of change are narrower, and only those are treated differently:
 * a file the server never loads, which runs nothing, and a scenario's own file, which runs
 * that scenario.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { isRecord, repoRoot } from './cinnabar.mts';

/** A workspace package, as far as the selection reads its manifest. */
export interface WorkspacePackage {
    /** The package's directory, relative to the repository root, with forward slashes. */
    root: string;
    name: string;
    /** The names of every package it depends on, development dependencies included. */
    dependencies: readonly string[];
}

export interface Selection {
    /** `all` runs every scenario, `some` runs `scenarios`, and `none` skips the run. */
    mode: 'all' | 'some' | 'none';
    scenarios: string[];
    /** The first changed file that made the run a full one. */
    because?: string;
}

/** The packages a run starts: the server, and the runner that drives the client against it. */
export const ENTRY_PACKAGES = ['packages/server', 'tools/client-e2e'];

const SCENARIOS = 'tools/client-e2e/src/scenarios/';

/** A test, a benchmark, a snapshot or a Markdown page. A running server loads none of them. */
const NEVER_LOADED = /(?:\.(?:test|bench)(?:\.[\w-]+)*\.[cm]?tsx?|\.md)$|(?:^|\/)__snapshots__\//;

/**
 * Finds the packages a run can load: the entry packages and everything they depend on.
 *
 * @param packages - Every workspace package.
 * @param entries - The roots of the packages a run starts.
 * @returns The roots of the entry packages and of their transitive dependencies.
 */
export const loadedPackages = (packages: readonly WorkspacePackage[], entries: readonly string[]): Set<string> => {
    const byName = new Map(packages.map((entry) => [entry.name, entry]));
    const loaded = new Set<string>();
    const visit = (entry: WorkspacePackage | undefined): void => {
        if (entry === undefined || loaded.has(entry.root)) return;
        loaded.add(entry.root);
        for (const dependency of entry.dependencies) visit(byName.get(dependency));
    };
    for (const entry of packages) if (entries.includes(entry.root)) visit(entry);
    return loaded;
};

/**
 * Chooses the scenarios to run for a set of changed files.
 *
 * @param changed - Changed files, relative to the repository root, with forward slashes.
 * @param packages - Every workspace package.
 * @param scenariosIn - The names of the scenarios a scenario file defines, or `undefined` when
 * the file cannot stand for its scenarios alone, such as a deleted file or one another file imports.
 * @returns The selection. Anything this function cannot place runs every scenario.
 */
export const selectScenarios = (
    changed: readonly string[],
    packages: readonly WorkspacePackage[],
    scenariosIn: (file: string) => readonly string[] | undefined
): Selection => {
    const loaded = loadedPackages(packages, ENTRY_PACKAGES);
    const scenarios = new Set<string>();
    for (const file of changed) {
        if (NEVER_LOADED.test(file)) continue;
        if (file.startsWith(SCENARIOS)) {
            const names = scenariosIn(file);
            if (names === undefined) return { mode: 'all', scenarios: [], because: file };
            for (const name of names) scenarios.add(name);
            continue;
        }
        const owner = packages.find((entry) => file.startsWith(`${entry.root}/`));
        if (owner !== undefined && !loaded.has(owner.root)) continue;
        return { mode: 'all', scenarios: [], because: file };
    }
    return scenarios.size > 0 ? { mode: 'some', scenarios: [...scenarios] } : { mode: 'none', scenarios: [] };
};

/** Reads the manifests of the workspace's packages, the directories `pnpm-workspace.yaml` lists. */
const readWorkspace = (): WorkspacePackage[] => {
    const packages: WorkspacePackage[] = [];
    for (const group of ['packages', 'tools']) {
        for (const directory of fs.readdirSync(path.join(repoRoot, group))) {
            const manifest = path.join(repoRoot, group, directory, 'package.json');
            if (!fs.existsSync(manifest)) continue;
            // JSON.parse returns `any`; the guards below narrow what is read from it.
            const parsed: unknown = JSON.parse(fs.readFileSync(manifest, 'utf8'));
            if (!isRecord(parsed) || typeof parsed.name !== 'string') continue;
            const dependencies = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
                .map((field) => parsed[field])
                .filter(isRecord)
                .flatMap((field) => Object.keys(field));
            packages.push({ root: `${group}/${directory}`, name: parsed.name, dependencies });
        }
    }
    return packages;
};

/** Imports the scenario files once each and reads the names of the scenarios they export. */
const readScenarios = async (files: readonly string[]): Promise<Map<string, readonly string[] | undefined>> => {
    const directory = path.join(repoRoot, SCENARIOS);
    const sources = fs.readdirSync(directory).map((name) => fs.readFileSync(path.join(directory, name), 'utf8'));
    const names = new Map<string, readonly string[] | undefined>();
    for (const file of files) {
        const absolute = path.join(repoRoot, file);
        // A scenario file that another one imports changes that one too, so it runs them all.
        const shared = sources.some((source) => source.includes(`/${path.basename(file)}'`));
        if (shared || !fs.existsSync(absolute)) {
            names.set(file, undefined);
            continue;
        }
        const exported: unknown = await import(pathToFileURL(absolute).href);
        const found = isRecord(exported)
            ? Object.values(exported).flatMap((value) =>
                  isRecord(value) && typeof value.name === 'string' && typeof value.run === 'function'
                      ? [value.name]
                      : []
              )
            : [];
        // A file with no scenario in it is a helper, and a helper's reach is not known here.
        names.set(file, found.length > 0 ? found : undefined);
    }
    return names;
};

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const changed = fs
        .readFileSync(0, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '');
    const names = await readScenarios(changed.filter((file) => file.startsWith(SCENARIOS)));
    const selection = selectScenarios(changed, readWorkspace(), (file) => names.get(file));

    const detail =
        selection.mode === 'all'
            ? `every scenario, because ${selection.because} changed`
            : selection.mode === 'some'
              ? selection.scenarios.join(', ')
              : 'no scenario, because nothing a running server loads changed';
    console.log(`client e2e: ${detail}`);
    if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(
            process.env.GITHUB_OUTPUT,
            `mode=${selection.mode}\nscenarios=${selection.scenarios.join(' ')}\n`
        );
    }
}
