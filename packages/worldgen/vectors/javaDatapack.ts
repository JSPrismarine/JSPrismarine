import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const cacheRoot = join(repoRoot, 'node_modules/.cache/jsprismarine');

/** The two cache directories the dimension tests read from. */
export interface VanillaDatapack {
    /** The `data/minecraft` directory of the vanilla datapack. */
    readonly data: string;
    /** The `reports` directory the Java data generator wrote. */
    readonly reports: string;
    /** Parses one JSON file under {@link data}. */
    readonly readData: (relativePath: string) => unknown;
    /** Parses one JSON file under {@link reports}. */
    readonly readReport: (relativePath: string) => unknown;
    /** Parses `reports/biome_parameters/minecraft/<name>.json` as the data generator wrote it. */
    readonly readBiomeParameters: (name: string) => unknown;
    /** Lists the `.json` files in a directory under {@link data}, as ids without the extension. */
    readonly listData: (relativeDirectory: string) => string[];
}

/** Picks the only versioned directory under `root` that contains `marker`. */
const onlyVersionIn = (root: string, marker: string): string | undefined => {
    if (!existsSync(root)) return undefined;
    const candidates = readdirSync(root)
        .map((entry) => join(root, entry))
        .filter((entry) => statSync(entry).isDirectory() && existsSync(join(entry, marker)));
    return candidates.length === 1 ? candidates[0] : undefined;
};

const override = (name: string): string | undefined => {
    const value = process.env[name];
    return value !== undefined && value !== '' && existsSync(value) ? value : undefined;
};

// Cache files are extracted game data and therefore untrusted; they are only parsed as JSON.
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

/**
 * Finds the cached vanilla datapack and data generator reports that
 * `pnpm --filter @jsprismarine/bedrock-data run ensure:worldgen` writes, or the directories
 * `JSP_VANILLA_DATAPACK` and `JSP_JAVA_REPORTS` point at.
 *
 * @returns Both directories, or undefined when either is missing so a test can skip.
 */
export const findVanillaDatapack = (): VanillaDatapack | undefined => {
    const datapack = override('JSP_VANILLA_DATAPACK') ?? onlyVersionIn(join(cacheRoot, 'vanilla-datapack'), 'data');
    const reportsRoot =
        override('JSP_JAVA_REPORTS') ?? onlyVersionIn(join(cacheRoot, 'java-reports'), join('generated', 'reports'));
    if (datapack === undefined || reportsRoot === undefined) return undefined;

    const data = join(datapack, 'data', 'minecraft');
    const reports = existsSync(join(reportsRoot, 'reports'))
        ? join(reportsRoot, 'reports')
        : join(reportsRoot, 'generated', 'reports');
    if (!existsSync(data) || !existsSync(reports)) return undefined;

    return {
        data,
        reports,
        readData: (relativePath) => readJson(join(data, relativePath)),
        readReport: (relativePath) => readJson(join(reports, relativePath)),
        readBiomeParameters: (name) => readJson(join(reports, 'biome_parameters', 'minecraft', `${name}.json`)),
        listData: (relativeDirectory) =>
            readdirSync(join(data, relativeDirectory))
                .filter((entry) => entry.endsWith('.json'))
                .map((entry) => entry.slice(0, -'.json'.length))
                .sort()
    };
};
