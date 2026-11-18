/**
 * Lifts Java Edition's English strings out of the pinned server jar.
 *
 * A Java advancement names its title with a translation key such as
 * `advancements.story.mine_stone.title`. A Bedrock client has no such string, so the server
 * resolves the key itself when it announces an advancement, and it reads the English text from
 * the `assets/minecraft/lang/en_us.json` the server jar carries. Writing it to
 * `node_modules/.cache/jsprismarine/java-lang/<version>/en_us.json` beside the rest of the Java
 * data means the server never opens the jar.
 *
 * Run as `pnpm --filter @jsprismarine/bedrock-data run extract:lang`, after `fetch:sources` has
 * put the hash-verified jar in the cache; `datagen:java` and `ensure:worldgen` run it too. Pass
 * `--force` to overwrite a file that is already there. Nothing in the jar is executed: it is read
 * as a zip and one entry is written as a file.
 */
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { hashFile } from '../fetch/hash.ts';
import { readZipEntries, readZipEntriesFrom } from '../fetch/unzip.ts';
import { cacheRoot, javaServerJarPath } from './worldgen-cache.ts';
import { resolveJavaRelease } from './release.ts';

/** Where the English strings sit inside the inner server jar. */
const LANG_ENTRY = 'assets/minecraft/lang/en_us.json';

/** The inner jar a bundler jar holds, which is where the assets actually are. */
const INNER_JAR = /^META-INF\/versions\/[^/]+\/server-[^/]+\.jar$/;

/** The file one Java Edition version's English strings are written to. */
export const javaLangPath = (version: string): string => join(cacheRoot, 'java-lang', version, 'en_us.json');

/**
 * Writes a server jar's English strings to a file.
 *
 * @throws {Error} When the jar carries no inner server jar, which means it is not the bundler jar
 *   Mojang publishes, or when the inner jar has no English strings.
 */
export const extractJavaLang = async (jarPath: string, destination: string): Promise<void> => {
    const outer = await readZipEntries(jarPath, (name) => INNER_JAR.test(name));
    const inner = [...outer.values()][0];
    if (inner === undefined) throw new Error(`${jarPath} holds no inner server jar`);

    const bytes = readZipEntriesFrom(inner, (name) => name === LANG_ENTRY).get(LANG_ENTRY);
    if (bytes === undefined) throw new Error(`${jarPath} holds no ${LANG_ENTRY}`);

    // Written beside the destination and renamed into place, so an interrupted run leaves no
    // half-written file for the server to read.
    mkdirSync(dirname(destination), { recursive: true });
    const staging = `${destination}.partial`;
    writeFileSync(staging, bytes);
    renameSync(staging, destination);
};

if (import.meta.filename === process.argv[1]) {
    const force = process.argv.includes('--force');
    const javaServer = await resolveJavaRelease(process.argv);
    const jarPath = javaServerJarPath(javaServer);
    const destination = javaLangPath(javaServer.version);

    if (existsSync(destination) && !force) {
        console.log(`Java ${javaServer.version} English strings are already in ${destination}.`);
    } else {
        if (!existsSync(jarPath)) {
            throw new Error(
                `${jarPath} is missing. Run \`pnpm --filter @jsprismarine/bedrock-data run fetch:sources --java ${javaServer.version}\` first, ` +
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

        await extractJavaLang(jarPath, destination);
        console.log(`Wrote the Java ${javaServer.version} English strings to ${destination}`);
    }
}
