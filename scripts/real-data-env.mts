import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolves the environment the real-data test suites read, and fails when a path is missing.
 *
 * A dozen suites across the repository are gated behind an environment variable because they
 * read the fetched Bedrock and Java sources, which a clean checkout does not have. Each one
 * skips silently when its variable is unset, so "the suite passes" and "the suite never ran"
 * look identical. This script is what makes CI tell them apart: it derives every path from
 * `packages/bedrock-data/sources.json`, checks the path exists, and refuses to emit anything
 * when one does not.
 *
 * Run it after `fetch:sources`, `datagen:java` and `dump:java` have filled the cache. Printing
 * the assignments is the local form; `--github-env` appends them to `$GITHUB_ENV` so the rest
 * of a workflow job inherits them.
 *
 * ```sh
 * node scripts/real-data-env.mts          # print, and fail if the cache is incomplete
 * node scripts/real-data-env.mts --github-env
 * ```
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheRoot = path.join(repoRoot, 'node_modules/.cache/jsprismarine');

/** The pins this script reads. `packages/bedrock-data/sources.json` is the manifest. */
interface Sources {
    bds: { version: string };
    bedrockSamples: { tag: string };
    javaServer: { version: string };
    geyserMappings: { commit: string };
}

/** One variable a suite reads, and the path it has to point at. */
interface RequiredPath {
    /** Environment variable name. */
    name: string;
    /** Absolute path the variable is set to. */
    value: string;
    /** Which script fills it, named in the failure message. */
    filledBy: string;
}

const readSources = (): Sources => {
    const file = path.join(repoRoot, 'packages/bedrock-data/sources.json');
    // The manifest is parsed JSON; Sources documents the fields this script reads.
    return JSON.parse(readFileSync(file, 'utf8')) as Sources;
};

const sources = readSources();

const FETCH = 'pnpm --filter @jsprismarine/bedrock-data run fetch:sources';
const DATAGEN = 'pnpm --filter @jsprismarine/bedrock-data run datagen:java';
const DUMP = 'pnpm --filter @jsprismarine/bedrock-data run dump:java';

/**
 * The paths the suites read.
 *
 * `JSP_VANILLA_BEHAVIOR_PACK`, `JSP_VANILLA_DATAPACK` and `JSP_JAVA_REPORTS` are each both a gate
 * and a path: the pack, loot, advancement, predicate and enchantment suites only check that they
 * are set, while the feature corpus, the data-driven generator and `resolvePackStack` read them as
 * directories. One correct path satisfies both. Setting one of them to `1` is worse than leaving it
 * unset, because `resolvePackStack` treats a path somebody typed as a statement of intent and drops
 * the member rather than falling back to the cache.
 */
const paths: RequiredPath[] = [
    { name: 'JSP_BDS_PATH', value: path.join(cacheRoot, 'bds', sources.bds.version, 'unpacked'), filledBy: FETCH },
    {
        // `packages/prismarine/src/content/packStack.ts` reads this as the folder of BDS vanilla
        // layers, and composes the content stack out of whichever of them are named `vanilla`.
        name: 'JSP_VANILLA_BEHAVIOR_PACK',
        value: path.join(cacheRoot, 'bds', sources.bds.version, 'unpacked', 'behavior_packs'),
        filledBy: FETCH
    },
    {
        name: 'JSP_JAVA_JAR_PATH',
        value: path.join(cacheRoot, 'java-server', sources.javaServer.version, 'server.jar'),
        filledBy: FETCH
    },
    {
        name: 'JSP_BEDROCK_SAMPLES_PATH',
        value: path.join(cacheRoot, 'bedrock-samples', sources.bedrockSamples.tag, 'unpacked'),
        filledBy: FETCH
    },
    {
        name: 'JSP_GEYSER_MAPPINGS_PATH',
        value: path.join(cacheRoot, 'geyser-mappings', sources.geyserMappings.commit, 'unpacked'),
        filledBy: FETCH
    },
    {
        name: 'JSP_VANILLA_DATAPACK',
        value: path.join(cacheRoot, 'vanilla-datapack', sources.javaServer.version),
        filledBy: DATAGEN
    },
    {
        name: 'JSP_JAVA_REPORTS',
        value: path.join(cacheRoot, 'java-reports', sources.javaServer.version, 'generated'),
        filledBy: DATAGEN
    },
    {
        // `packages/worldgen/vectors/javaWorldgenData.ts` reads the registries straight out of
        // the bundler's inner jar, which only the Java dumper unpacks.
        name: 'JSP_JAVA_SERVER_JAR',
        value: path.join(
            cacheRoot,
            'java',
            sources.javaServer.version,
            'extracted/META-INF/versions',
            sources.javaServer.version,
            `server-${sources.javaServer.version}.jar`
        ),
        filledBy: DUMP
    }
];

/**
 * The variables that are a gate and nothing else. Their value is never read, only its presence,
 * so `1` is as good as anything and says plainly that the suite is on.
 */
const GATES = [
    'JSP_CONTENT_VANILLA',
    'JSP_FEATURE_CORPUS',
    'JSP_STRUCTURE_CORPUS',
    'JSP_VANILLA_BLOCKS',
    'JSP_VANILLA_ENTITIES',
    'JSP_VANILLA_RECIPES',
    'JSP_VANILLA_SPAWN_RULES',
    'JSP_VANILLA_TRADE_TABLES'
] as const;

const missing = paths.filter((required) => !existsSync(required.value));
if (missing.length > 0) {
    const listing = missing.map((required) => `  ${required.name}: ${required.value}\n    run: ${required.filledBy}`);
    const present = existsSync(cacheRoot) ? readdirSync(cacheRoot).join(', ') : 'nothing, the cache does not exist';
    throw new Error(
        `The real-data suites need ${missing.length} path(s) the cache does not have:\n${listing.join('\n')}\n` +
            `The cache holds: ${present}.`
    );
}

const assignments = [
    ...paths.map((required) => `${required.name}=${required.value}`),
    ...GATES.map((gate) => `${gate}=1`)
];

const githubEnv = process.env['GITHUB_ENV'];
if (process.argv.includes('--github-env')) {
    if (githubEnv === undefined || githubEnv === '') throw new Error('--github-env needs GITHUB_ENV to be set');
    appendFileSync(githubEnv, `${assignments.join('\n')}\n`);
}

for (const assignment of assignments) console.log(assignment);
