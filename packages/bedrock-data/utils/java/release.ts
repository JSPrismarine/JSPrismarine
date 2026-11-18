/**
 * Which Java Edition release a script works on, and what that release's server jar declares about
 * itself.
 *
 * Every script that reads the Java server jar or the data generated from it learns its release
 * here, so the choice is made in one place.
 */
import { join } from 'node:path';

import {
    javaServerDescriptor,
    loadJavaServerData,
    parseJavaArgument,
    type SourceDescriptor
} from '../fetch/manifest.ts';
import { readZipEntry } from '../fetch/unzip.ts';
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

/** The fields of a server jar's `version.json` the Java scripts read. */
export interface JarVersion {
    /** Feature release the jar was built for, the lowest JDK that can run it. */
    readonly java_version: number;
    /** Format numbers a datapack must declare to load in this version. */
    readonly pack_version: { readonly data_major: number; readonly data_minor: number };
}

/**
 * Reads the `version.json` Mojang puts at the root of a server jar.
 *
 * @param jarPath - The bundler server jar.
 * @returns The parsed file.
 * @throws Error when the jar has no `version.json`, so it is not a Minecraft server jar.
 */
export const readJarVersion = async (jarPath: string): Promise<JarVersion> => {
    const bytes = await readZipEntry(jarPath, 'version.json');
    if (bytes === undefined) throw new Error(`${jarPath} has no version.json; it is not a Minecraft server jar`);
    // Extracted game data: parsed, never executed.
    return JSON.parse(bytes.toString('utf8')) as JarVersion;
};
