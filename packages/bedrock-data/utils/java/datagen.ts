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
 * every reader above.
 *
 * Run as `pnpm --filter @jsprismarine/bedrock-data run datagen:java`, after `fetch:sources` has
 * put the hash-verified jar in the cache. Pass `--force` to regenerate output that is already
 * present. The output is Mojang's content, large and derived, so it stays in the gitignored
 * cache and is never committed.
 *
 * Nothing from inside the jar is executed beyond the official `net.minecraft.data.Main` entry
 * point, and every path the generator touches is passed to it as an argument.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hashFile } from '../fetch/hash.ts';
import { loadSourceDescriptors } from '../fetch/manifest.ts';
import { readZipEntry } from '../fetch/unzip.ts';
import { extractJavaStructures } from './extract-structures.ts';
import { findJdkHome } from './jdk.ts';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cacheRoot = resolve(packageDir, '../../node_modules/.cache/jsprismarine');
const force = process.argv.includes('--force');

/**
 * Files that prove a previous run finished. Each names a registry a different reader depends on,
 * so a half-written cache fails the check instead of being skipped over.
 */
const DATAPACK_WITNESSES = [
    'pack.mcmeta',
    'data/minecraft/worldgen/noise_settings/overworld.json',
    'data/minecraft/worldgen/biome/plains.json',
    'data/minecraft/tags/block/logs.json',
    'data/minecraft/loot_table/blocks/stone.json'
];
const REPORT_WITNESSES = [
    'reports/blocks.json',
    'reports/registries.json',
    'reports/biome_parameters/minecraft/overworld.json'
];

const hasAll = (root: string, witnesses: readonly string[]): boolean =>
    witnesses.every((witness) => existsSync(join(root, ...witness.split('/'))));

// ---------------------------------------------------------------------------
// The pinned jar
// ---------------------------------------------------------------------------

const descriptors = await loadSourceDescriptors(join(packageDir, 'sources.json'));
const javaServer = descriptors.find((descriptor) => descriptor.name === 'java-server');
if (javaServer === undefined) throw new Error('sources.json no longer pins a java-server source');

const version = javaServer.version;
const override = process.env[javaServer.envOverride];
const jarPath =
    override !== undefined && override !== ''
        ? override
        : join(cacheRoot, javaServer.name, version, javaServer.fileName);

const datapackDir = join(cacheRoot, 'vanilla-datapack', version);
const reportsDir = join(cacheRoot, 'java-reports', version, 'generated');
const structuresDir = join(cacheRoot, 'java-structures', version);
const workDir = join(cacheRoot, 'java-datagen', version);

/** One template every overworld needs, which proves the extraction finished. */
const STRUCTURE_WITNESSES = ['village/plains/houses/plains_small_house_1.nbt'];

if (
    hasAll(datapackDir, DATAPACK_WITNESSES) &&
    hasAll(reportsDir, REPORT_WITNESSES) &&
    hasAll(structuresDir, STRUCTURE_WITNESSES) &&
    !force
) {
    console.log(
        `Java ${version} datapack, reports and structure templates are already in ${cacheRoot}; ` +
            'pass --force to regenerate.'
    );
    process.exit(0);
}

if (!existsSync(jarPath)) {
    throw new Error(
        `${jarPath} is missing. Run \`pnpm --filter @jsprismarine/bedrock-data run fetch:sources\` first, ` +
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

/** The fields of the jar's `version.json` this step reads. */
interface JarVersion {
    /** Feature release the jar was built for, the lowest JDK that can run it. */
    java_version: number;
    /** Format numbers a datapack must declare to load in this version. */
    pack_version: { data_major: number; data_minor: number };
}

const versionBytes = await readZipEntry(jarPath, 'version.json');
if (versionBytes === undefined) throw new Error(`${jarPath} has no version.json; it is not a Minecraft server jar`);
// Extracted game data: parsed, never executed.
const jarVersion = JSON.parse(versionBytes.toString('utf8')) as JarVersion;

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

const javaBinary = join(findJdkHome({ minimumMajor: jarVersion.java_version }), 'bin', 'java');

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

const { data_major: major, data_minor: minor } = jarVersion.pack_version;
const mcmeta = {
    pack: {
        description: `Minecraft Java Edition ${version} vanilla data`,
        min_format: [major, minor],
        max_format: [major, minor]
    }
};
writeFileSync(join(datapackDir, 'pack.mcmeta'), `${JSON.stringify(mcmeta, undefined, 4)}\n`);

rmSync(workDir, { recursive: true, force: true });

console.log(`Wrote the vanilla datapack to ${datapackDir} (pack format ${major}.${minor})`);
console.log(`Wrote the data reports to ${join(reportsDir, 'reports')}`);
