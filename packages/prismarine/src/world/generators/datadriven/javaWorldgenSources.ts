/**
 * Where the fetched Java Edition world generation data sits on this machine.
 *
 * This module imports nothing but `node:fs` and `node:path` on purpose. `packages/parity`
 * asks it whether a checkout has the data from `scripts/capture-corpus.ts`, which runs under
 * node's own type stripping before Vite is up, and strip-only mode cannot load
 * `@jsprismarine/packs`. The loader that reads the data lives in
 * [`javaWorldgenData.ts`](javaWorldgenData.ts).
 */
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Points the loader at a local copy of one fetched source. */
export const JAVA_WORLDGEN_ENV = {
    /** A Java vanilla datapack directory, as the Java data generator writes one. */
    datapack: 'JSP_VANILLA_DATAPACK',
    /** A Java data generator output directory, the one holding `reports/`. */
    reports: 'JSP_JAVA_REPORTS'
} as const;

/** The two directories the registries are read out of. */
export interface JavaWorldgenSources {
    /** The datapack root, the directory holding `data/`. */
    readonly datapack: string;
    /** The data generator output root, the directory holding `reports/`. */
    readonly reports: string;
}

/** The nearest existing `node_modules/.cache/jsprismarine` at or above the working directory. */
export const cacheRoot = (): string => {
    let directory = process.cwd();
    for (;;) {
        const candidate = join(directory, 'node_modules', '.cache', 'jsprismarine');
        if (existsSync(candidate)) return candidate;

        const parent = dirname(directory);
        if (parent === directory) return join(process.cwd(), 'node_modules', '.cache', 'jsprismarine');
        directory = parent;
    }
};

/** The one version directory under a cache folder, or undefined when there is none. */
const onlyVersionIn = (root: string, holds: string): string | undefined => {
    if (!existsSync(root)) return undefined;

    for (const entry of readdirSync(root).sort().reverse()) {
        const candidate = join(root, entry);
        if (existsSync(join(candidate, holds))) return candidate;
    }

    return undefined;
};

/**
 * An environment override wins outright, including when it points at nothing: a path somebody
 * typed is a statement of intent, and falling back to the cache would generate a world from
 * data the server was told not to use.
 */
const sourcePath = (override: string | undefined, found: () => string | undefined): string | undefined => {
    if (override !== undefined && override !== '') return existsSync(override) ? override : undefined;
    return found();
};

/**
 * Finds the datapack and the data generator reports.
 *
 * @returns Both directories, or undefined when either is missing. The generator needs both,
 *   and half the data produces a world that is quietly not Java's.
 */
export const findJavaWorldgenSources = (): JavaWorldgenSources | undefined => {
    const root = cacheRoot();
    const datapack = sourcePath(process.env[JAVA_WORLDGEN_ENV.datapack], () =>
        onlyVersionIn(join(root, 'vanilla-datapack'), 'data')
    );
    const reports = sourcePath(process.env[JAVA_WORLDGEN_ENV.reports], () =>
        onlyVersionIn(join(root, 'java-reports'), join('generated', 'reports'))
    );

    if (datapack === undefined || reports === undefined) return undefined;

    // The data generator writes its output under `generated/`; an override may point at either.
    const reportsRoot = existsSync(join(reports, 'reports')) ? reports : join(reports, 'generated');
    return existsSync(join(reportsRoot, 'reports')) ? { datapack, reports: reportsRoot } : undefined;
};
