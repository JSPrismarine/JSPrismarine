/**
 * Which Java Edition release a script works on, and what that release's server jar declares about
 * itself.
 *
 * Every script that reads the Java server jar or the data generated from it learns its release
 * here, so the choice is made in one place.
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
    GENERATED_JAVA_VERSION_FILE,
    javaBedrockPair,
    type GeneratedJavaVersion,
    type JavaBedrockPair
} from '../../src/sources.ts';

import {
    javaServerDescriptor,
    loadJavaServerData,
    parseJavaArgument,
    type SourceDescriptor
} from '../fetch/manifest.ts';
import { readZipEntry } from '../fetch/unzip.ts';
import { isRecord } from '../isRecord.ts';
import { packageDir } from './worldgen-cache.ts';

/**
 * The `sources.json` entry for the Java Edition release a script should work on: the one
 * `--java <release>` names, or `javaServer.defaultVersion` when the flag is absent.
 *
 * @param argv - The script's command line arguments.
 * @returns The descriptor of the release's server jar.
 * @throws Error when `--java` has no value, names a release `sources.json` does not pin, or the
 * manifest breaks the one-preview rule.
 */
export const resolveJavaRelease = async (argv: readonly string[] = process.argv): Promise<SourceDescriptor> =>
    javaServerDescriptor(await loadJavaServerData(join(packageDir, 'sources.json')), parseJavaArgument(argv));

/**
 * The (Java release, Bedrock protocol) pair a table generator should work on: the pair of the
 * release `--java <release>` names, or of `javaServer.defaultVersion` when the flag is absent.
 *
 * @param argv - The script's command line arguments.
 * @returns The pair, whose `java` names the tables' release directory and whose `protocol` names
 * the Bedrock capture they map onto.
 * @throws Error when `--java` has no value or names a release `sources.json` does not pin.
 */
export const resolveJavaBedrockPair = (argv: readonly string[] = process.argv): JavaBedrockPair => {
    const release = parseJavaArgument(argv);
    const pair = javaBedrockPair(release);
    if (pair === undefined) throw new Error(`sources.json pins no Java Edition release ${release}`);
    return pair;
};

/** The fields of a server jar's `version.json` the Java scripts read. */
export interface JarVersion {
    /** The release id, such as `26.3`. */
    readonly id: string;
    /** The world data version a save written by this release records. */
    readonly world_version: number;
    /** The protocol number a client of this release sends in its handshake. */
    readonly protocol_version: number;
    /** Feature release the jar was built for, the lowest JDK that can run it. */
    readonly java_version: number;
    /** Format numbers a datapack, and a resource pack, must declare to load in this version. */
    readonly pack_version: {
        readonly data_major: number;
        readonly data_minor: number;
        readonly resource_major: number;
        readonly resource_minor: number;
    };
}

/**
 * Reads the `version.json` Mojang puts at the root of a server jar.
 *
 * @param jarPath - The bundler server jar.
 * @returns The parsed file.
 * @throws Error when the jar has no `version.json`, so it is not a Minecraft server jar, or when
 * the file lacks one of the fields {@link JarVersion} lists.
 */
export const readJarVersion = async (jarPath: string): Promise<JarVersion> => {
    const bytes = await readZipEntry(jarPath, 'version.json');
    if (bytes === undefined) throw new Error(`${jarPath} has no version.json; it is not a Minecraft server jar`);
    // Extracted game data: parsed, never executed.
    const parsed: unknown = JSON.parse(bytes.toString('utf8'));
    if (
        !isRecord(parsed) ||
        typeof parsed.id !== 'string' ||
        typeof parsed.world_version !== 'number' ||
        typeof parsed.protocol_version !== 'number' ||
        typeof parsed.java_version !== 'number' ||
        !isRecord(parsed.pack_version) ||
        typeof parsed.pack_version.data_major !== 'number' ||
        typeof parsed.pack_version.data_minor !== 'number' ||
        typeof parsed.pack_version.resource_major !== 'number' ||
        typeof parsed.pack_version.resource_minor !== 'number'
    ) {
        throw new Error(
            `${jarPath} has a version.json without the id, world_version, protocol_version, java_version and ` +
                'pack_version.data_major/data_minor/resource_major/resource_minor fields a server jar declares'
        );
    }
    const { data_major, data_minor, resource_major, resource_minor } = parsed.pack_version;
    return {
        id: parsed.id,
        world_version: parsed.world_version,
        protocol_version: parsed.protocol_version,
        java_version: parsed.java_version,
        pack_version: { data_major, data_minor, resource_major, resource_minor }
    };
};

/**
 * Writes `version.json` into a generated vanilla datapack, recording what its jar declares, so
 * the runtime learns the release's data pack format and data version without opening the jar.
 *
 * @param jarPath - The bundler server jar the datapack was generated from.
 * @param datapackDir - The datapack root, the directory holding `pack.mcmeta`.
 * @returns The record written.
 */
export const writeGeneratedJavaVersion = async (
    jarPath: string,
    datapackDir: string
): Promise<GeneratedJavaVersion> => {
    const jar = await readJarVersion(jarPath);
    const record: GeneratedJavaVersion = {
        release: jar.id,
        javaVersion: jar.java_version,
        dataPackFormat: [jar.pack_version.data_major, jar.pack_version.data_minor],
        dataVersion: jar.world_version
    };
    await writeFile(join(datapackDir, GENERATED_JAVA_VERSION_FILE), `${JSON.stringify(record, undefined, 4)}\n`);
    return record;
};
