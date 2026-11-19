/**
 * The proof step of a Java Edition bring-up: checks that one pinned release's data is pinned,
 * generated, reproducible, loadable and runnable, and prints a pass or fail per stage, as
 * `bringup --protocol` does for a Bedrock protocol.
 *
 * ```sh
 * pnpm run bringup:java --java 26.3
 * pnpm run bringup:java --java 26.4-snapshot-8 --quick
 * ```
 *
 * The stages, in order:
 *
 * 1. **pins**: `sources.json` pins the release and the cached jar matches its sha1, fetching it
 *    first when it is missing.
 * 2. **generate**: runs `datagen:java --java <release>` when the cache is incomplete, then checks
 *    the witness files and that `version.json` names the release.
 * 3. **reproducibility**: runs the data generator again into `java-bringup/<release>/` under the
 *    cache and compares every file with the installed copy, byte for byte. `--quick` skips it.
 * 4. **strict load**: loads the vanilla datapack through `@jsprismarine/packs` in strict mode and
 *    prints the first 20 error diagnostics on a failure.
 * 5. **corpus**: runs the Java corpus suites and the `unhandledJavaTypes.test.ts` registry checks
 *    with `JSP_VANILLA_DATAPACK` and `JSP_JAVA_REPORTS` pointed at the release.
 * 6. **noise chunks**: generates chunk 0, 0 of the Overworld, the Nether and the End through the
 *    data-driven generator, with the release's datapack, reports and data pack format.
 * 7. **server boot**: starts a server on a flat world through the client-e2e harness with
 *    `content-java-version` set to the release, waits for it to listen and stops it.
 * 8. **command tree**: checks that the booted server built its vanilla command tree, whose
 *    registry arguments validate against the release's loaded content.
 *
 * A failed pins or generate stage stops the run, since every later stage reads what they produce.
 * The rest all run, so one report shows every failure. The exit status is 0 only when every stage
 * passes. The script imports workspace source from `packages/packs` and `tools/client-e2e`, so it
 * runs under tsx. `.agents/skills/java-bringup/SKILL.md` places it in the whole workflow.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir, rm } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { parseArgs } from 'node:util';

import { load, PackLoadError } from '../../../packs/src/load.ts';
import type { Diagnostic } from '../../../packs/src/diagnostics.ts';
import { startServer } from '../../../../tools/client-e2e/src/jsp-server.mts';
import { Dimensions } from '../../../prismarine/src/world/DimensionType.ts';
import { DataDrivenGenerator } from '../../../prismarine/src/world/generators/datadriven/DataDrivenGenerator.ts';
import { loadJavaWorldgenRegistries } from '../../../prismarine/src/world/generators/datadriven/javaWorldgenData.ts';
import { readGeneratedJavaVersion } from '../../src/sources.ts';
import { fetchSource } from '../fetch/fetch.ts';
import { verifyFileHash } from '../fetch/hash.ts';
import type { SourceDescriptor } from '../fetch/manifest.ts';
import { javaLangPath } from './extract-lang.ts';
import { resolveJavaRelease } from './release.ts';
import {
    cacheRoot,
    javaServerJarPath,
    packageDir,
    worldgenCacheComplete,
    worldgenCachePaths,
    type WorldgenCachePaths
} from './worldgen-cache.ts';

const repositoryRoot = join(packageDir, '../..');

const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
        /** The pinned release to bring up. Defaults to `javaServer.defaultVersion`. */
        java: { type: 'string' },
        /** Skips the reproducibility stage, which runs the data generator a second time. */
        quick: { type: 'boolean', default: false }
    }
});

/** The corpus suites, by package, that read the vanilla datapack. Missing files are skipped. */
const CORPUS_PACKAGES = ['loot', 'recipes', 'predicates', 'advancements', 'features', 'structures'];

/** How many error diagnostics a failed strict load prints. */
const SHOWN_DIAGNOSTICS = 20;

const results: { stage: string; passed: boolean }[] = [];

const report = (stage: string, passed: boolean, detail: string): void => {
    results.push({ stage, passed });
    console.log(`${passed ? 'PASS' : 'FAIL'} ${stage}: ${detail}`);
};

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const finish = (): never => {
    const failed = results.filter((result) => !result.passed).map((result) => result.stage);
    console.log(
        failed.length === 0
            ? `Java bring-up check passed: ${results.length} stages.`
            : `Java bring-up check failed at: ${failed.join(', ')}.`
    );
    process.exit(failed.length === 0 ? 0 : 1);
};

/** Runs `datagen:java` for the release, with its output on this console. */
const runDatagen = (release: string, extra: readonly string[] = []): boolean =>
    spawnSync(process.execPath, ['utils/java/datagen.ts', '--java', release, ...extra], {
        cwd: packageDir,
        stdio: 'inherit'
    }).status === 0;

// ---------------------------------------------------------------------------
// Stage 1: pins
// ---------------------------------------------------------------------------

let source: SourceDescriptor;
try {
    source = await resolveJavaRelease(values.java === undefined ? [] : ['--java', values.java]);
    await fetchSource(source, { cacheRoot });
    // The fetch trusts its cache marker; this re-hashes the jar the later stages run.
    await verifyFileHash(javaServerJarPath(source), source.hash);
    report(
        'pins',
        true,
        `sources.json pins Java ${source.version} and the jar matches ${source.hash.algorithm} ${source.hash.value}`
    );
} catch (error) {
    report('pins', false, message(error));
    console.error(
        '  Pin it: add an entry under `javaServer.versions` in packages/bedrock-data/sources.json with the ' +
            "server download's url and sha1 from piston-meta, shaped like the existing entries."
    );
    finish();
}
const release = source.version;
const paths = worldgenCachePaths(release);

// ---------------------------------------------------------------------------
// Stage 2: generate
// ---------------------------------------------------------------------------

if (!worldgenCacheComplete(paths)) {
    console.log(`Java ${release} has no complete generated data; running datagen:java.`);
    runDatagen(release);
}
const recorded = readGeneratedJavaVersion(paths.datapack);
if (!worldgenCacheComplete(paths)) {
    report('generate', false, `the witness files under ${paths.datapack} and ${paths.reports} are incomplete`);
    finish();
} else if (recorded?.release !== release) {
    report(
        'generate',
        false,
        `${join(paths.datapack, 'version.json')} names ${recorded?.release ?? 'no release'}, not ${release}`
    );
    finish();
} else {
    report(
        'generate',
        true,
        `data pack format ${recorded.dataPackFormat.join('.')}, data version ${recorded.dataVersion}`
    );
}

// ---------------------------------------------------------------------------
// Stage 3: reproducibility
// ---------------------------------------------------------------------------

/** The sha256 of every file under a directory, keyed by its `/`-separated relative path. */
const hashTree = async (root: string): Promise<Map<string, string>> => {
    const hashes = new Map<string, string>();
    if (!existsSync(root)) return hashes;
    for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const absolute = join(entry.parentPath, entry.name);
        hashes.set(
            relative(root, absolute).split(sep).join('/'),
            createHash('sha256')
                .update(await readFile(absolute))
                .digest('hex')
        );
    }
    return hashes;
};

/** The paths whose content differs between two hashed trees, or that only one side has. */
const treeDifferences = (installed: Map<string, string>, regenerated: Map<string, string>): string[] =>
    [...new Set([...installed.keys(), ...regenerated.keys()])].filter(
        (path) => installed.get(path) !== regenerated.get(path)
    );

/** The generated directories one datagen run writes, by a label for the report. */
const generatedRoots = (generated: WorldgenCachePaths, root?: string): Record<string, string> => ({
    'vanilla-datapack': generated.datapack,
    'java-reports': generated.reports,
    'java-structures': generated.structures,
    'java-lang': join(javaLangPath(release, root), '..')
});

if (values.quick) {
    console.log('SKIP reproducibility: --quick');
} else {
    const scratch = join(cacheRoot, 'java-bringup', release);
    await rm(scratch, { recursive: true, force: true });
    if (!runDatagen(release, ['--output-root', scratch])) {
        report('reproducibility', false, `the second datagen:java run into ${scratch} failed`);
    } else {
        const installed = generatedRoots(paths);
        const regenerated = generatedRoots(worldgenCachePaths(release, scratch), scratch);
        let compared = 0;
        const differences: string[] = [];
        for (const [label, root] of Object.entries(installed)) {
            const before = await hashTree(root);
            const after = await hashTree(regenerated[label]!);
            compared += before.size;
            differences.push(...treeDifferences(before, after).map((path) => `${label}/${path}`));
        }
        if (differences.length === 0) {
            report('reproducibility', true, `${compared} files byte-identical across two runs`);
            await rm(scratch, { recursive: true, force: true });
        } else {
            report(
                'reproducibility',
                false,
                `${differences.length} files differ; the second run is kept in ${scratch}`
            );
            for (const path of differences.slice(0, SHOWN_DIAGNOSTICS)) console.log(`  ${path}`);
        }
    }
}

// ---------------------------------------------------------------------------
// Stage 4: strict load
// ---------------------------------------------------------------------------

const describeDiagnostic = (diagnostic: Diagnostic): string =>
    `  ${diagnostic.code} ${diagnostic.path ?? ''}: ${diagnostic.message}`;

try {
    // The release's own format, so the pack's `pack.mcmeta` range is checked against it.
    const java = { release, format: recorded.dataPackFormat, dataVersion: recorded.dataVersion };
    const { definitions, diagnostics } = load([{ kind: 'datapack', path: paths.datapack }], { strict: true, java });
    const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length;
    report(
        'strict load',
        true,
        `${definitions.lootTablesJava.size} loot tables, ${definitions.recipesJava.size} recipes, ` +
            `${definitions.worldgen.size} worldgen definitions, no errors, ${warnings} warnings`
    );
} catch (error) {
    if (error instanceof PackLoadError) {
        const errors = error.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
        report('strict load', false, `${errors.length} error diagnostics`);
        for (const diagnostic of errors.slice(0, SHOWN_DIAGNOSTICS)) console.log(describeDiagnostic(diagnostic));
    } else {
        report('strict load', false, message(error));
    }
}

// ---------------------------------------------------------------------------
// Stage 5: corpus
// ---------------------------------------------------------------------------

const releaseEnvironment = {
    JSP_VANILLA_DATAPACK: paths.datapack,
    JSP_JAVA_REPORTS: paths.reports
};

const packagesRoot = join(repositoryRoot, 'packages');
const suites = [
    ...CORPUS_PACKAGES.map((name) => join('packages', name, 'src', 'corpus.test.ts')),
    ...(await readdir(packagesRoot)).map((name) => join('packages', name, 'src', 'unhandledJavaTypes.test.ts'))
].filter((suite) => existsSync(join(repositoryRoot, suite)));

const corpus = spawnSync('pnpm', ['exec', 'vitest', 'run', ...suites], {
    cwd: repositoryRoot,
    stdio: 'inherit',
    env: {
        ...process.env,
        ...releaseEnvironment,
        // The two corpus suites that are off by default, and the jar the structure corpus reads.
        JSP_FEATURE_CORPUS: '1',
        JSP_STRUCTURE_CORPUS: '1',
        JSP_JAVA_JAR_PATH: javaServerJarPath(source)
    }
});
report('corpus', corpus.status === 0, `${suites.length} suites ${corpus.status === 0 ? 'passed' : 'failed'}`);

// ---------------------------------------------------------------------------
// Stage 6: noise chunks
// ---------------------------------------------------------------------------

/** The seed the noise chunks are generated at; any seed exercises the grammar. */
const NOISE_SEED = 1234n;

/** The three vanilla noise dimensions, each with the settings and biome source Java gives it. */
const NOISE_STEMS = [
    {
        noiseSettings: 'minecraft:overworld',
        biomeSource: { type: 'minecraft:multi_noise', preset: 'minecraft:overworld' },
        dimension: Dimensions.Overworld
    },
    {
        noiseSettings: 'minecraft:nether',
        biomeSource: { type: 'minecraft:multi_noise', preset: 'minecraft:nether' },
        dimension: Dimensions.Nether
    },
    { noiseSettings: 'minecraft:end', biomeSource: { type: 'minecraft:the_end' }, dimension: Dimensions.TheEnd }
] as const;

try {
    // In-thread, with no worker pool, so the stage reads this release's data and nothing else.
    const registries = loadJavaWorldgenRegistries({ datapack: paths.datapack, reports: paths.reports });
    const generator = new DataDrivenGenerator({ registries });
    const generated: string[] = [];
    try {
        for (const stem of NOISE_STEMS) {
            const chunk = await generator.forStem(stem).generateChunk(0, 0, NOISE_SEED);
            const surface = chunk.getHighestBlockAt(0, 0);
            generated.push(`${stem.dimension.id} (top block at y ${surface ?? 'none'})`);
        }
    } finally {
        generator.stopGenerating();
    }
    report('noise chunks', true, `chunk 0, 0 of ${generated.join(', ')}`);
} catch (error) {
    report('noise chunks', false, message(error));
}

// ---------------------------------------------------------------------------
// Stage 7: server boot, and stage 8: command tree
// ---------------------------------------------------------------------------

/** The line `CommandManager.enable` logs once it has built the vanilla command tree. */
const COMMAND_TREE_LINE = /Registered \S*?(\d+)\S* command\(s\)/;

try {
    // Only the config key names the release. The harness hands this process's environment to the
    // server, where an exported `JSP_VANILLA_DATAPACK` would choose the datapack in the key's
    // place, so it is removed first and the boot exercises the release resolution itself.
    delete process.env.JSP_VANILLA_DATAPACK;
    const server = await startServer({ seconds: 180, javaVersion: release });
    const listening = server.lines.find((line) => line.includes('now listening on port'));
    const commandTree = server.lines.map((line) => COMMAND_TREE_LINE.exec(line)).find((match) => match !== null);
    await server.stop();
    report('server boot', true, listening?.trim() ?? `listening on port ${server.port}`);
    report(
        'command tree',
        commandTree !== undefined,
        commandTree === undefined
            ? 'the server logged no built command tree'
            : `${commandTree[1]} vanilla commands registered against the loaded registries`
    );
} catch (error) {
    report('server boot', false, message(error));
    report('command tree', false, 'the server did not boot');
}

finish();
