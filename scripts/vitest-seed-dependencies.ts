/**
 * Gives `--since-last-run` a starting record in a checkout that has none.
 *
 * `vitest run --since-last-run` reruns a test file when a file it loaded on its last run is newer
 * than that run, and it always runs a test file with no record. Vitest writes the records only
 * when a run finishes, so the first run in a new worktree or clone runs every suite, and a first
 * run that is stopped part way records nothing.
 *
 * When the records file is missing, this plugin writes one from the static import graph before
 * Vitest selects the tests. It parses each module's imports with Vite's parser and resolves them
 * with Vite's resolver, without transforming any module. The seed treats the merge base with the
 * default branch as the last run: a test file that reaches a file changed since then gets no
 * record and runs, and every other test file counts as run at the moment of the seed. The first
 * real run of a test file replaces its seeded record with the one Vitest recorded at run time.
 */
import { execFile } from 'node:child_process';
import { readFile, rename, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { parseSync } from 'vite';
import type { Plugin } from 'vitest/config';
import type { TestProject, Vitest } from 'vitest/node';

import changedFilesProvider from './vitest-changed-files.ts';

const run = promisify(execFile);

/** The version of `dependencies.json` that Vitest 5 reads. Another version makes Vitest ignore the file. */
export const DEPENDENCIES_VERSION = 2;

/** A module Vite's parser can read imports from. Anything else, such as JSON, imports nothing. */
const SCRIPT = /\.[cm]?[jt]sx?$/;

/** A string literal with no interpolation, the only dynamic import specifier a static walk can follow. */
const LITERAL = /^(['"`])([^'"`$]*)\1$/;

/**
 * Loads through Vite that the parser does not report as imports. A `require` is left out: Node
 * loads it outside Vite, so a run's record would not list it either.
 */
const UNFOLLOWED = /\bimport\.meta\.glob\b|\bvi\.import(?:Actual|Mock)\b/;

/** The imports of one module. */
export interface ModuleImports {
    /** Specifiers a run of the module loads, in source order. */
    specifiers: string[];
    /** The module loads something the specifiers do not name, so a test that reaches it needs a real run. */
    opaque: boolean;
}

/**
 * Reads the specifiers a module imports at run time: static imports and re-exports that are not
 * type-only, and dynamic imports of a string literal.
 *
 * @param file - The module's path, whose extension tells the parser the language.
 * @param code - The module's source.
 */
export const readImports = (file: string, code: string): ModuleImports => {
    if (!SCRIPT.test(file)) return { specifiers: [], opaque: false };
    const { module, errors } = parseSync(file, code);
    const specifiers: string[] = [];
    let opaque = errors.length > 0 || UNFOLLOWED.test(code);

    for (const entry of module.staticImports) {
        // `import type` and `import { type A }` are erased, but `import './side-effect'` has no entries.
        if (entry.entries.length > 0 && entry.entries.every((binding) => binding.isType)) continue;
        specifiers.push(entry.moduleRequest.value);
    }
    for (const statement of module.staticExports) {
        for (const entry of statement.entries) {
            if (entry.moduleRequest && !entry.isType) specifiers.push(entry.moduleRequest.value);
        }
    }
    for (const entry of module.dynamicImports) {
        const literal = LITERAL.exec(code.slice(entry.moduleRequest.start, entry.moduleRequest.end));
        if (literal?.[2] === undefined) opaque = true;
        else specifiers.push(literal[2]);
    }
    return { specifiers: [...new Set(specifiers)], opaque };
};

/** A module in the import graph. */
export interface GraphNode {
    /** The files it imports that a change can affect: absolute, outside `node_modules`. */
    imports: string[];
    /** See {@link ModuleImports.opaque}. */
    opaque: boolean;
}

/** How {@link buildGraph} reads and resolves modules. */
export interface GraphHost {
    /** The source of a file, or `undefined` when it cannot be read. */
    read(file: string): Promise<string | undefined>;
    /** The file a specifier resolves to from `importer`, or `undefined` for a package, a builtin or a failure. */
    resolve(specifier: string, importer: string): Promise<string | undefined>;
}

/**
 * Walks the import graph from `entries`, following every import that resolves to a local file.
 *
 * @returns Every module reached, entries included.
 */
export const buildGraph = async (entries: readonly string[], host: GraphHost): Promise<Map<string, GraphNode>> => {
    const graph = new Map<string, GraphNode>();
    let pending = [...new Set(entries)];
    while (pending.length > 0) {
        const wave = pending.filter((file) => !graph.has(file));
        pending = [];
        // Claim the wave before reading it, so a module two others import is read once.
        for (const file of wave) graph.set(file, { imports: [], opaque: false });
        await Promise.all(
            wave.map(async (file) => {
                const code = await host.read(file);
                const node = graph.get(file);
                if (node === undefined) return;
                if (code === undefined) {
                    node.opaque = true;
                    return;
                }
                const { specifiers, opaque } = readImports(file, code);
                const resolved = await Promise.all(specifiers.map((specifier) => host.resolve(specifier, file)));
                node.imports = [...new Set(resolved.filter((target) => target !== undefined))];
                node.opaque = opaque;
                for (const target of node.imports) if (!graph.has(target)) pending.push(target);
            })
        );
    }
    return graph;
};

/** One test file's record: when it notionally ran, and the indices of the modules it loaded. */
export interface FileRecord {
    at: number;
    deps: number[];
}

/** One project's entry in `dependencies.json`. */
export interface ProjectRecords {
    modules: string[];
    config: FileRecord;
    files: Record<string, FileRecord>;
}

/** The input to {@link seedRecords}. */
export interface SeedInput {
    /** The repository root, which every path in the records is relative to. */
    root: string;
    /** Absolute test files. */
    testFiles: readonly string[];
    /** Absolute setup files, which every test file loads. */
    setupFiles: readonly string[];
    /** Absolute files that rerun every test when they change, such as the Vitest config. */
    configFiles: readonly string[];
    graph: ReadonlyMap<string, GraphNode>;
    /** Absolute files changed since the run the seed stands for. */
    changed: ReadonlySet<string>;
    /** The time the seed stands for, in milliseconds since the epoch. */
    at: number;
}

/** What {@link seedRecords} produced. */
export interface SeedResult {
    records: ProjectRecords;
    /** Test files left without a record, so the next `--since-last-run` runs them. */
    unrecorded: string[];
}

/**
 * Builds one project's records from the import graph.
 *
 * A test file that reaches a changed file, or a module whose loads the graph cannot follow, gets no
 * record. When a config file changed, the config record predates every file, so Vitest reruns
 * every test, as it would after a config change between two runs.
 */
export const seedRecords = (input: SeedInput): SeedResult => {
    const modules: string[] = [];
    const index = new Map<string, number>();
    const intern = (file: string): number => {
        let position = index.get(file);
        if (position === undefined) {
            position = modules.push(path.relative(input.root, file).split(path.sep).join('/')) - 1;
            index.set(file, position);
        }
        return position;
    };

    const closure = (starts: readonly string[]): { files: Set<string>; opaque: boolean } => {
        const files = new Set<string>();
        let opaque = false;
        const stack = [...starts];
        for (let file = stack.pop(); file !== undefined; file = stack.pop()) {
            if (files.has(file)) continue;
            files.add(file);
            const node = input.graph.get(file);
            if (node === undefined || node.opaque) opaque = true;
            if (node !== undefined) stack.push(...node.imports);
        }
        return { files, opaque };
    };

    const configChanged = input.configFiles.some((file) => input.changed.has(file));
    const config = { at: configChanged ? 0 : input.at, deps: input.configFiles.map(intern) };

    const files: Record<string, FileRecord> = {};
    const unrecorded: string[] = [];
    for (const testFile of input.testFiles) {
        const reached = closure([testFile, ...input.setupFiles]);
        if (reached.opaque || [...reached.files].some((file) => input.changed.has(file))) {
            unrecorded.push(testFile);
            continue;
        }
        const key = path.relative(input.root, testFile).split(path.sep).join('/');
        files[key] = { at: input.at, deps: [...reached.files].map(intern) };
    }
    return { records: { modules, config, files }, unrecorded };
};

const git = async (cwd: string, args: readonly string[]): Promise<string | undefined> => {
    try {
        const { stdout } = await run('git', [...args], { cwd });
        return stdout.trim();
    } catch {
        return undefined;
    }
};

/**
 * The commit the seed stands for the last run at: the merge base of `HEAD` and the remote's default
 * branch, which CI tested, or `HEAD` when there is no remote.
 */
const findBase = async (root: string): Promise<string> => {
    const remoteHead = (await git(root, ['rev-parse', '--abbrev-ref', 'origin/HEAD'])) ?? 'origin/master';
    return (await git(root, ['merge-base', 'HEAD', remoteHead])) ?? 'HEAD';
};

/** The files `--changed` reports since `base`, through the repository's provider. */
const findChanged = async (root: string, base: string): Promise<Set<string>> => {
    const changed = await changedFilesProvider.findChangedFiles({
        root,
        changedSince: base,
        // The Git provider reads no dependencies.
        resolver: { getDependencies: async () => [] }
    });
    return new Set(changed.map((file) => path.resolve(root, file)));
};

/** Strips a Vite query such as `?raw` from a resolved id. */
const fileOf = (id: string): string => id.split('?', 1)[0] ?? id;

/**
 * Reads and resolves through the project's SSR environment, which runs the tests.
 *
 * A resolution depends on the importer's directory, not the importer: the package and the
 * `tsconfig` that apply are the directory's. Caching by directory and specifier resolves each
 * pair once, where the suite's modules ask for 23 times as many resolutions as there are pairs.
 */
export const createHost = (project: TestProject): GraphHost => {
    const environment = project.vite.environments.ssr;
    const resolutions = new Map<string, Promise<string | undefined>>();
    const resolveOnce = async (specifier: string, importer: string): Promise<string | undefined> => {
        const resolved = await environment?.pluginContainer.resolveId(specifier, importer).catch(() => null);
        if (!resolved || resolved.external) return undefined;
        const file = fileOf(resolved.id);
        return path.isAbsolute(file) && !file.includes('node_modules') ? file : undefined;
    };
    return {
        read: (file) => readFile(file, 'utf8').catch(() => undefined),
        resolve(specifier, importer) {
            const key = `${path.dirname(importer)}\0${specifier}`;
            let resolution = resolutions.get(key);
            if (resolution === undefined) {
                resolution = resolveOnce(specifier, importer);
                resolutions.set(key, resolution);
            }
            return resolution;
        }
    };
};

/** The config files Vitest records for a project: the configs and what they import, and the env files. */
const configFilesOf = (vitest: Vitest, project: TestProject): string[] => {
    const { envDir, mode } = project.vite.config;
    const envFiles =
        typeof envDir === 'string'
            ? ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`].map((file) => path.resolve(envDir, file))
            : [];
    return [
        ...new Set([
            ...(vitest.vite.config.configFileDependencies ?? []),
            ...(project.vite.config.configFileDependencies ?? []),
            ...envFiles
        ])
    ].filter((file) => existsSync(file));
};

/** Options for {@link seedSinceLastRun}. */
export interface SeedOptions {
    /**
     * Globs, relative to the repository root, of files that rerun every test. A seed is skipped
     * when one of them changed since the base, so the first run is a full one, as in CI.
     */
    forceRerunTriggers: readonly string[];
}

const seed = async (vitest: Vitest, options: SeedOptions): Promise<void> => {
    const target = path.join(vitest.vite.config.cacheDir, 'dependencies.json');
    if (existsSync(target)) return;

    const root = vitest.config.root;
    const changed = await findChanged(root, await findBase(root));
    const trigger = [...changed].find((file) =>
        options.forceRerunTriggers.some((pattern) => path.matchesGlob(path.relative(root, file), pattern))
    );
    if (trigger !== undefined) {
        vitest.logger.log(`--since-last-run: ${path.relative(root, trigger)} changed, so every test runs once.`);
        return;
    }

    const at = Date.now();
    const projects: Record<string, ProjectRecords> = {};
    let recorded = 0;
    let unrecorded = 0;
    for (const project of vitest.projects) {
        const { testFiles } = await project.globTestFiles();
        const setupFiles = project.config.setupFiles;
        const graph = await buildGraph([...testFiles, ...setupFiles], createHost(project));
        const result = seedRecords({
            root,
            testFiles,
            setupFiles,
            configFiles: configFilesOf(vitest, project),
            graph,
            changed,
            at
        });
        projects[project.name] = result.records;
        recorded += Object.keys(result.records.files).length;
        unrecorded += result.unrecorded.length;
    }

    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify({ version: DEPENDENCIES_VERSION, projects }));
    await rename(temporary, target);
    vitest.logger.log(
        `--since-last-run: no records yet, so ${recorded} test files take theirs from the import graph and ${unrecorded} run.`
    );
};

/**
 * A Vitest plugin that seeds the `--since-last-run` records of a checkout that has none, as the
 * module comment describes. It does nothing on any other run.
 */
export const seedSinceLastRun = (options: SeedOptions): Plugin => {
    const seeded = new WeakSet<Vitest>();
    return {
        name: 'jsprismarine:seed-since-last-run',
        async configureVitest({ vitest }) {
            if (seeded.has(vitest)) return;
            seeded.add(vitest);
            const { experimental } = vitest.config;
            if (!vitest.config.cache || !experimental.recordDependencies || experimental.vcsProvider !== 'mtime')
                return;
            // Without a seed the run is Vitest's own first run, so a failure here costs time, not tests.
            await seed(vitest, options).catch((error: unknown) => {
                vitest.logger.warn(`--since-last-run: could not seed the records, so every test runs once: ${error}`);
            });
        }
    };
};
