/**
 * Writes `src/jsp/java/entity_goals.json`: the goals each Java mob registers and the arguments it
 * passes them, read out of the pinned Java Edition server jar's bytecode.
 *
 * This is a capture-time task, run on a Java version bump. It needs only the jar that
 * `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` caches, and no JDK: nothing here
 * loads or runs a class, it only reads class files.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hashFile } from '../fetch/hash.ts';
import { loadSourceDescriptors } from '../fetch/manifest.ts';
import { readZipEntriesFrom } from '../fetch/unzip.ts';
import { captureJavaGoals } from './capture.ts';
import { createJavaGoalReader } from './goals.ts';

/** Every class file of the real server jar the bundler jar holds, by entry name. */
export const readServerClasses = (bundlerJar: Buffer): Map<string, Buffer> => {
    const inner = [
        ...readZipEntriesFrom(bundlerJar, (name) => /^META-INF\/versions\/[^/]+\/server-.+\.jar$/.test(name)).values()
    ][0];
    if (inner === undefined) throw new Error('the server jar holds no META-INF/versions inner jar');
    return readZipEntriesFrom(inner, (name) => name.startsWith('net/minecraft/') && name.endsWith('.class'));
};

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Where the committed capture lives. */
export const CAPTURE_PATH = join(packageDir, 'src/jsp/java/entity_goals.json');

/**
 * The pinned Java server jar: `JSP_JAVA_SERVER_JAR` when set, otherwise the copy
 * `fetch:sources` caches.
 *
 * @returns The jar's path and whether it exists, with the pin it was checked against.
 */
export const pinnedServerJar = async (): Promise<{
    readonly path: string;
    readonly exists: boolean;
    readonly version: string;
    readonly hash: { readonly algorithm: string; readonly value: string };
    readonly envOverride: string;
}> => {
    const cacheRoot = resolve(packageDir, '../../node_modules/.cache/jsprismarine');
    const descriptors = await loadSourceDescriptors(join(packageDir, 'sources.json'));
    const javaServer = descriptors.find((descriptor) => descriptor.name === 'java-server');
    if (javaServer === undefined) throw new Error('sources.json no longer pins a java-server source');
    const override = process.env[javaServer.envOverride];
    const path =
        override !== undefined && override !== ''
            ? override
            : join(cacheRoot, javaServer.name, javaServer.version, javaServer.fileName);
    return {
        path,
        exists: existsSync(path),
        version: javaServer.version,
        hash: javaServer.hash,
        envOverride: javaServer.envOverride
    };
};

/** Reads the capture out of a bundler jar's bytes. */
export const captureFromJar = (bundlerJar: Buffer): ReturnType<typeof captureJavaGoals> => {
    const classes = readServerClasses(bundlerJar);
    return captureJavaGoals(createJavaGoalReader((className) => classes.get(`${className}.class`)));
};

/** The capture as the committed file spells it. */
export const formatCapture = (capture: ReturnType<typeof captureJavaGoals>): string =>
    `${JSON.stringify(capture, null, 4)}\n`;

if (import.meta.filename === process.argv[1]) {
    const jar = await pinnedServerJar();
    if (!jar.exists) {
        throw new Error(
            `${jar.path} is missing. Run \`pnpm --filter @jsprismarine/bedrock-data run fetch:sources\` first, ` +
                `or set ${jar.envOverride} to a local copy of the Java ${jar.version} server jar.`
        );
    }
    const digest = await hashFile(jar.path, jar.hash.algorithm);
    if (digest !== jar.hash.value) {
        throw new Error(
            `${jar.path} has ${jar.hash.algorithm} ${digest}, but sources.json pins ${jar.hash.value}. Refusing to read it.`
        );
    }

    const capture = captureFromJar(readFileSync(jar.path));
    writeFileSync(CAPTURE_PATH, formatCapture(capture));
    console.log(`Wrote ${relative(packageDir, CAPTURE_PATH)} (${Object.keys(capture).length} entity types)`);
}
