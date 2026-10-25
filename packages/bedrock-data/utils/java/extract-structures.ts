/**
 * Lifts Java Edition's structure templates out of the pinned server jar.
 *
 * The data generator writes JSON and no NBT, so the 1511 `.nbt` templates are the one part of
 * Java's world generation data that `datagen:java` does not produce. They ship inside the jar,
 * under `data/minecraft/structure/`, and the world generator needs them to place a village, a
 * shipwreck or an igloo.
 *
 * Without this step the generator reads them out of the jar itself, which means inflating all
 * 17655 of its entries on the first template a world places: about five seconds and 290 MB of
 * transient memory, paid inside chunk generation. Writing them to
 * `node_modules/.cache/jsprismarine/java-structures/<version>/` turns that into a 4 MB directory
 * read lazily, file by file.
 *
 * Run as `pnpm --filter @jsprismarine/bedrock-data run extract:structures`, after
 * `fetch:sources` has put the hash-verified jar in the cache; `datagen:java` runs it too. Pass
 * `--force` to overwrite output that is already there. Nothing in the jar is executed: it is
 * read as a zip and the entries are written as files.
 */
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hashFile } from '../fetch/hash.ts';
import { loadSourceDescriptors } from '../fetch/manifest.ts';
import { readZipEntries, readZipEntriesFrom } from '../fetch/unzip.ts';

/** Where the templates sit inside the inner server jar. */
const JAR_PREFIX = 'data/minecraft/structure/';

/** The inner jar a bundler jar holds, which is where the data actually is. */
const INNER_JAR = /^META-INF\/versions\/[^/]+\/server-[^/]+\.jar$/;

/** A file that proves a previous run finished, named by a structure every overworld has. */
const WITNESS = join('village', 'plains', 'houses', 'plains_small_house_1.nbt');

/**
 * Writes every `.nbt` template of a server jar into a directory, laid out as the datapack lays a
 * registry out.
 *
 * @returns How many templates were written.
 * @throws {Error} When the jar carries no inner server jar, which means it is not the bundler jar
 *   Mojang publishes, or when it carries no templates at all.
 */
export const extractJavaStructures = async (jarPath: string, destination: string): Promise<number> => {
    const outer = await readZipEntries(jarPath, (name) => INNER_JAR.test(name));
    const inner = [...outer.values()][0];
    if (inner === undefined) throw new Error(`${jarPath} holds no inner server jar`);

    const templates = readZipEntriesFrom(inner, (name) => name.startsWith(JAR_PREFIX) && name.endsWith('.nbt'));
    if (templates.size === 0) throw new Error(`${jarPath} holds no structure templates under ${JAR_PREFIX}`);

    // Written beside the destination and renamed into place, so an interrupted run leaves no
    // half-filled directory for the generator to read as complete.
    const staging = `${destination}.partial`;
    rmSync(staging, { recursive: true, force: true });

    for (const [name, bytes] of templates) {
        const target = join(staging, ...name.slice(JAR_PREFIX.length).split('/'));
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, bytes);
    }

    rmSync(destination, { recursive: true, force: true });
    mkdirSync(dirname(destination), { recursive: true });
    renameSync(staging, destination);
    return templates.size;
};

if (import.meta.filename === process.argv[1]) {
    const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    const cacheRoot = resolve(packageDir, '../../node_modules/.cache/jsprismarine');
    const force = process.argv.includes('--force');

    const descriptors = await loadSourceDescriptors(join(packageDir, 'sources.json'));
    const javaServer = descriptors.find((descriptor) => descriptor.name === 'java-server');
    if (javaServer === undefined) throw new Error('sources.json no longer pins a java-server source');

    const override = process.env[javaServer.envOverride];
    const jarPath =
        override !== undefined && override !== ''
            ? override
            : join(cacheRoot, javaServer.name, javaServer.version, javaServer.fileName);
    const destination = join(cacheRoot, 'java-structures', javaServer.version);

    if (existsSync(join(destination, WITNESS)) && !force) {
        console.log(`Java ${javaServer.version} structure templates are already in ${destination}.`);
    } else {
        if (!existsSync(jarPath)) {
            throw new Error(
                `${jarPath} is missing. Run \`pnpm --filter @jsprismarine/bedrock-data run fetch:sources\` first, ` +
                    `or set ${javaServer.envOverride} to a local copy of the Java ${javaServer.version} server jar.`
            );
        }

        const digest = await hashFile(jarPath, javaServer.hash.algorithm);
        if (digest !== javaServer.hash.value) {
            throw new Error(
                `${jarPath} has ${javaServer.hash.algorithm} ${digest}, but sources.json pins ` +
                    `${javaServer.hash.value}. Refusing to read it.`
            );
        }

        const written = await extractJavaStructures(jarPath, destination);
        console.log(`Wrote ${written} structure templates to ${destination}`);
    }
}
