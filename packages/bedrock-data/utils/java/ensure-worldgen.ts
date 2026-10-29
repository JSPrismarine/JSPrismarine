/**
 * Makes sure the Java Edition world generation cache exists, so `pnpm dev` can start the
 * default overworld on a clean clone.
 *
 * The overworld generator is built from Mojang's published world generation data rather than
 * shipped with this server, and that data is a 62 MB download and a data generator run. Paying
 * for it during `pnpm install` would charge everyone who only builds or tests the repository,
 * so it happens here instead, as a prerequisite of `pnpm dev` alone. `pnpm start` and CI are
 * left to arrange their own data.
 *
 * On a warm cache this reads a handful of file names and exits, so repeat runs are fast and
 * reach no network. The work is `fetch:sources` for the jar followed by `datagen:java`, both
 * unchanged; this step only decides whether to run them and turns their failures into one
 * actionable line rather than a stack trace.
 *
 * Run as `pnpm --filter @jsprismarine/bedrock-data run ensure:worldgen`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchSource } from '../fetch/fetch.ts';
import { findJdkHome, JDK_HOME_ENV } from './jdk.ts';
import {
    cacheRoot,
    javaServerJarPath,
    loadJavaServerSource,
    worldgenCacheComplete,
    worldgenCachePaths
} from './worldgen-cache.ts';

const here = dirname(fileURLToPath(import.meta.url));

/** Reports a problem the way a prerequisite step should: one paragraph, no stack. */
const fail = (message: string): never => {
    console.error(`\n${message}\n`);
    process.exit(1);
};

/** The way out for somebody who does not want Java on their machine at all. */
const FLAT_WORLD_HINT =
    'To run without any of this, set `generator` to `Flat` for your world in `jsp/config.json`. ' +
    'A flat world needs no Java data, but it is not Minecraft terrain.';

const source = await loadJavaServerSource();
const paths = worldgenCachePaths(source.version);

if (worldgenCacheComplete(paths)) {
    console.log(`Java ${source.version} world generation data is ready in ${cacheRoot}`);
    process.exit(0);
}

// Asked before the download, so somebody without a JDK learns that in a second rather than
// after 62 MB. The pinned minimum lives in the jar, which is not here yet, so this only asks
// whether there is a Java at all; `datagen:java` re-checks against the real requirement.
try {
    findJdkHome({ minimumMajor: 1 });
} catch {
    fail(
        `Building the Java ${source.version} world generation data needs a JDK, and no \`java\` was found.\n` +
            'Install one (Temurin, for example) and re-run, or set ' +
            `${JDK_HOME_ENV} to a JDK's home directory.\n\n${FLAT_WORLD_HINT}`
    );
}

const jarPath = javaServerJarPath(source);
if (!existsSync(jarPath)) {
    const override = process.env[source.envOverride];
    if (override !== undefined && override !== '') {
        fail(`${source.envOverride} points at ${override}, which does not exist.`);
    }

    console.log(`Downloading the Java ${source.version} server jar; this happens once.`);
    try {
        await fetchSource(source, { cacheRoot });
    } catch (error) {
        fail(
            `Could not download the Java ${source.version} server jar: ${error instanceof Error ? error.message : String(error)}\n` +
                `Re-run with a network connection, or set ${source.envOverride} to a local copy of the jar.` +
                `\n\n${FLAT_WORLD_HINT}`
        );
    }
}

console.log(`Building the Java ${source.version} world generation data; this takes a few minutes, once.`);
try {
    execFileSync(process.execPath, [join(here, 'datagen.ts')], { stdio: 'inherit' });
} catch {
    fail(
        `The Java ${source.version} data generator failed; its output is above.\n` +
            `If it could not find a new enough JDK, install one or set ${JDK_HOME_ENV}.` +
            `\n\n${FLAT_WORLD_HINT}`
    );
}
