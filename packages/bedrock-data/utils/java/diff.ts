/**
 * Prints the mechanical delta between two Java Edition releases' generated data as Markdown.
 *
 * ```sh
 * pnpm --filter @jsprismarine/bedrock-data run java:diff 26.3 26.4-snapshot-8 --out delta.md
 * ```
 *
 * Both releases need their vanilla datapack and data reports in the cache, which
 * `datagen:java --java <release>` writes. The report is the raw material for a release's research
 * note, step 3 of `.agents/skills/java-bringup/SKILL.md`; `datapack-diff.ts` describes each section.
 */
import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

import { diffJavaData, renderJavaDataDelta, type JavaGeneratedTree } from './datapack-diff.ts';
import { worldgenCachePaths } from './worldgen-cache.ts';

/** Every file under a directory, keyed by its `/`-separated path from that directory. */
const readTree = async (root: string, filter: (path: string) => boolean): Promise<Map<string, string>> => {
    const files = new Map<string, string>();
    for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const absolute = join(entry.parentPath, entry.name);
        const path = relative(root, absolute).split(sep).join('/');
        if (filter(path)) files.set(path, await readFile(absolute, 'utf8'));
    }
    return files;
};

/** Reports `java:diff` reads; the rest of `reports/` is not part of the delta. */
const REPORTS = new Set(['registries.json', 'blocks.json']);

/**
 * Throws unless a release's datapack and every report in {@link REPORTS} are in the cache. A
 * missing report would otherwise read as an empty one, and the delta would list all of its
 * entries as added or removed.
 *
 * @throws Error naming the first missing path and the command that generates it.
 */
const requireRelease = (release: string): void => {
    const paths = worldgenCachePaths(release);
    const reports = join(paths.reports, 'reports');
    for (const required of [join(paths.datapack, 'data'), ...[...REPORTS].map((name) => join(reports, name))]) {
        if (!existsSync(required)) {
            throw new Error(
                `${required} is missing. Run \`pnpm --filter @jsprismarine/bedrock-data run datagen:java --java ${release}\` first.`
            );
        }
    }
};

/** Reads one release's generated datapack and reports out of the cache, which {@link requireRelease} checked. */
const loadRelease = async (release: string): Promise<JavaGeneratedTree> => {
    const paths = worldgenCachePaths(release);
    return {
        release,
        datapack: await readTree(
            paths.datapack,
            (path) => path === 'version.json' || (path.startsWith('data/minecraft/') && path.endsWith('.json'))
        ),
        reports: await readTree(join(paths.reports, 'reports'), (path) => REPORTS.has(path))
    };
};

const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
        /** Writes the Markdown to this file instead of standard output. */
        out: { type: 'string' }
    }
});

const [from, to] = positionals;
if (from === undefined || to === undefined || positionals.length > 2) {
    throw new Error('java:diff needs two release ids, such as `java:diff 26.3 26.4-snapshot-8 [--out <file>]`');
}

// Both releases are checked before either is read, so a missing cache fails before any work.
requireRelease(from);
requireRelease(to);
const markdown = renderJavaDataDelta(diffJavaData(await loadRelease(from), await loadRelease(to)));

if (values.out === undefined) {
    process.stdout.write(markdown);
} else {
    // pnpm runs the script from the package directory; INIT_CWD is where the caller ran it.
    const target = resolve(process.env.INIT_CWD ?? process.cwd(), values.out);
    await writeFile(target, markdown);
    console.log(`Wrote the Java ${from} to ${to} delta to ${target}`);
}
