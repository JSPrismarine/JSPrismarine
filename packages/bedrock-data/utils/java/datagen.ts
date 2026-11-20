/**
 * Runs Mojang's Java Edition data generator against the pinned server jar and lays its output
 * out where the rest of the repository reads it (plan section 6, the compose stage).
 *
 * One generator run writes both halves the project needs:
 *
 * - `node_modules/.cache/jsprismarine/vanilla-datapack/<version>/`, the vanilla datapack, read by
 *   `@jsprismarine/packs` for the pack stack, by the overworld generator for the `worldgen/*`
 *   registries and the block tags, and by the loot, advancement, predicate, enchantment and
 *   feature corpus suites;
 * - `node_modules/.cache/jsprismarine/java-reports/<version>/generated/reports/`, the data
 *   reports, read by the mapping and item table generators and by the overworld generator for
 *   `biome_parameters`.
 *
 * The generator writes no `pack.mcmeta` of its own, so this step writes one from the jar's
 * declared data pack version. That file is what marks the directory as a complete datapack for
 * every reader above. Beside it goes `version.json`, the release id, JDK, data pack format and
 * data version the jar declares.
 *
 * Run as `pnpm --filter @jsprismarine/bedrock-data run datagen:java`, after `fetch:sources` has
 * put the hash-verified jar in the cache. Pass `--java <release>` to generate a pinned release
 * other than the default, and `--force` to regenerate output that is already
 * present. `--output-root <dir>` lays the output out under `<dir>` instead of the cache root, with
 * the same directory names; `bringup:java` uses it to regenerate into scratch space and compare. The output is Mojang's content, large and derived, so it stays in the gitignored
 * cache and is never committed.
 *
 * Nothing from inside the jar is executed beyond the official `net.minecraft.data.Main` entry
 * point, and every path the generator touches is passed to it as an argument.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { hashFile } from '../fetch/hash.ts';
import { isRecord } from '../isRecord.ts';
import { extractJavaLang, javaLangPath } from './extract-lang.ts';
import { extractJavaStructures } from './extract-structures.ts';
import { findJdkHome, jdkBinaryPath } from './jdk.ts';
import { readJarVersion, resolveJavaRelease, writeGeneratedJavaVersion } from './release.ts';
import { cacheRoot, javaServerJarPath, worldgenCacheComplete, worldgenCachePaths } from './worldgen-cache.ts';

const { values: flags } = parseArgs({
    args: process.argv.slice(2),
    options: {
        java: { type: 'string' },
        force: { type: 'boolean', default: false },
        'output-root': { type: 'string' }
    }
});
const force = flags.force;
const outputRoot = flags['output-root'] === undefined ? cacheRoot : resolve(flags['output-root']);

// ---------------------------------------------------------------------------
// The pinned jar
// ---------------------------------------------------------------------------

const javaServer = await resolveJavaRelease(process.argv);

const version = javaServer.version;
const jarPath = javaServerJarPath(javaServer);

const paths = worldgenCachePaths(version, outputRoot);
const { datapack: datapackDir, reports: reportsDir, structures: structuresDir, work: workDir } = paths;

if (worldgenCacheComplete(paths) && !force) {
    console.log(
        `Java ${version} datapack, reports and structure templates are already in ${outputRoot}; ` +
            'pass --force to regenerate.'
    );
    process.exit(0);
}

if (!existsSync(jarPath)) {
    throw new Error(
        `${jarPath} is missing. Run \`pnpm --filter @jsprismarine/bedrock-data run fetch:sources --java ${version}\` first, ` +
            `or set ${javaServer.envOverride} to a local copy of the Java ${version} server jar.`
    );
}

// The fetch step verified this jar when it downloaded it, but this step is about to execute it,
// so the digest is checked again rather than inherited from a cache marker.
const digest = await hashFile(jarPath, javaServer.hash.algorithm);
if (digest !== javaServer.hash.value) {
    throw new Error(
        `${jarPath} has ${javaServer.hash.algorithm} ${digest}, but sources.json pins ` +
            `${javaServer.hash.value}. Refusing to run it.`
    );
}

const jarVersion = await readJarVersion(jarPath);

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

const javaBinary = jdkBinaryPath(findJdkHome({ minimumMajor: jarVersion.java_version }), 'java');

// The bundler unpacks its libraries into the working directory, so the generator runs in a
// directory of its own that this step deletes afterwards.
rmSync(workDir, { recursive: true, force: true });
const outputDir = join(workDir, 'out');
mkdirSync(outputDir, { recursive: true });

console.log(`Running the Java ${version} data generator with ${javaBinary}`);
execFileSync(
    javaBinary,
    [
        '-DbundlerMainClass=net.minecraft.data.Main',
        '-jar',
        jarPath,
        '--server',
        '--reports',
        '--all',
        '--output',
        outputDir
    ],
    { cwd: workDir, stdio: 'inherit' }
);

for (const produced of ['data', 'reports']) {
    if (!existsSync(join(outputDir, produced))) {
        throw new Error(`The data generator wrote no ${produced}/ into ${outputDir}`);
    }
}

/** Replaces a directory with one the generator just wrote, by rename rather than by copy. */
const install = (from: string, to: string): void => {
    rmSync(to, { recursive: true, force: true });
    mkdirSync(dirname(to), { recursive: true });
    renameSync(from, to);
};

install(join(outputDir, 'data'), join(datapackDir, 'data'));
install(join(outputDir, 'reports'), join(reportsDir, 'reports'));

/**
 * `loot_context_requirements.json` (new in 26.4) lists each context set's `allowed` and `required`
 * parameters in the iteration order of a Java identity-hashed set, which changes from run to run.
 * The arrays are sets, so sorting them loses nothing and makes two runs byte-identical, which the
 * bring-up's reproducibility stage checks.
 */
const sortLootContextRequirements = (path: string): void => {
    if (!existsSync(path)) return;
    // An object of context sets, each an object of parameter-name arrays.
    const report: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!isRecord(report)) throw new Error(`${path} is not a JSON object of loot context sets`);
    for (const set of Object.values(report)) {
        if (!isRecord(set)) continue;
        for (const [key, value] of Object.entries(set)) {
            if (Array.isArray(value)) set[key] = value.toSorted();
        }
    }
    writeFileSync(path, `${JSON.stringify(report, undefined, 2)}\n`);
};
sortLootContextRequirements(join(reportsDir, 'reports', 'loot_context_requirements.json'));

const { data_major: major, data_minor: minor } = jarVersion.pack_version;
const mcmeta = {
    pack: {
        description: `Minecraft Java Edition ${version} vanilla data`,
        min_format: [major, minor],
        max_format: [major, minor]
    }
};
writeFileSync(join(datapackDir, 'pack.mcmeta'), `${JSON.stringify(mcmeta, undefined, 4)}\n`);
// The release record beside it, which the runtime reads instead of the jar.
await writeGeneratedJavaVersion(jarPath, datapackDir);

rmSync(workDir, { recursive: true, force: true });

// The generator writes no NBT, so the structure templates come straight out of the jar. Doing
// it here means one command leaves a complete world generation cache behind.
const templateCount = await extractJavaStructures(jarPath, structuresDir);
// The English strings, which the server names an advancement with.
await extractJavaLang(jarPath, javaLangPath(version, outputRoot));

console.log(`Wrote the vanilla datapack to ${datapackDir} (pack format ${major}.${minor})`);
console.log(`Wrote the data reports to ${join(reportsDir, 'reports')}`);
console.log(`Wrote ${templateCount} structure templates to ${structuresDir}`);
console.log(`Wrote the English strings to ${javaLangPath(version, outputRoot)}`);
