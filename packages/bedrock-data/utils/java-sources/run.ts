/**
 * Stamps the fingerprints of the members `@javaSource` tags name into
 * `packages/parity/goldens/java-sources.json`, and prints a member's listing.
 *
 * The tags, the golden and the fingerprint are described in docs/plans/java-transcriptions.md.
 * `scripts/check-java-sources.mts` checks the tags against the golden without the jar, and the
 * `java.transcriptions` parity family checks the golden against the pinned jar. This is the part
 * that writes the golden, so it lives beside the jar pin and its `--java` flag; the golden itself
 * belongs to the parity family that reads it.
 *
 * `--update` reads the jar of the default release, or of `--java <release>`, resolves every tag,
 * stamps the fingerprint of each new member and drops the names and members no tag uses. A
 * fingerprint the golden records for no release of an already recorded member is a change, even
 * for a release stamped for the first time, and it is stamped only when `--reviewed <spelling>`
 * names it, after someone has read the new bytecode against the TypeScript that copies it.
 *
 * `--list <spelling>` prints the normalized listing the fingerprint hashes, for that review. Two
 * releases' listings diff cleanly:
 *
 * ```sh
 * pnpm --filter @jsprismarine/bedrock-data run --silent java:sources --list X --java 26.3 > old
 * pnpm --filter @jsprismarine/bedrock-data run --silent java:sources --list X --java 26.4 > new
 * diff old new
 * ```
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { JavaClass } from '@jsprismarine/java-classfile/classFile';
import { parseJavaClass } from '@jsprismarine/java-classfile/classFile';
import { javaSourceFingerprint, javaSourceKey, javaSourceListing } from '@jsprismarine/java-classfile/fingerprint';
import type {
    JavaClassIndex,
    JavaReference,
    JavaSourceGolden,
    JavaSourceTag
} from '@jsprismarine/java-classfile/sources';
import {
    formatJavaSourceGolden,
    needsReview,
    readJavaSourceGolden,
    resolveJavaSource,
    scanRepository
} from '@jsprismarine/java-classfile/sources';

import { pinnedServerJar, readServerClasses } from '../java-goals/run.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const goldenPath = join(repoRoot, 'packages', 'parity', 'goldens', 'java-sources.json');

/** The value after each `--flag` on the command line. */
const flagValues = (argv: readonly string[], flag: string): string[] =>
    argv.flatMap((argument, index) =>
        argument === flag && argv[index + 1] !== undefined ? [argv[index + 1] ?? ''] : []
    );

/**
 * The pinned jar's classes, by binary name, parsed on first use.
 *
 * @returns The release and its class index, or undefined when the jar is not cached.
 */
export const readPinnedJar = async (): Promise<
    { readonly version: string; readonly index: JavaClassIndex } | undefined
> => {
    const jar = await pinnedServerJar();
    if (!jar.exists) return undefined;
    const classes = new Map<string, Buffer>();
    for (const [entry, bytes] of readServerClasses(readFileSync(jar.path)))
        classes.set(entry.slice(0, -'.class'.length), bytes);
    const parsed = new Map<string, JavaClass>();
    const load = (name: string): JavaClass | undefined => {
        const cached = parsed.get(name);
        if (cached !== undefined) return cached;
        const bytes = classes.get(name);
        if (bytes === undefined) return undefined;
        const parsedClass = parseJavaClass(bytes);
        parsed.set(name, parsedClass);
        return parsedClass;
    };
    return { version: jar.version, index: { names: [...classes.keys()], load } };
};

/** {@link readPinnedJar}, failing with the command that fetches a jar that is not cached. */
const readJar = async (): Promise<{ readonly version: string; readonly index: JavaClassIndex }> => {
    const jar = await readPinnedJar();
    if (jar !== undefined) return jar;
    const { path, version } = await pinnedServerJar();
    throw new Error(
        `${path} is missing; run \`pnpm --filter @jsprismarine/bedrock-data run fetch:sources --java ${version}\``
    );
};

/**
 * What the `java.transcriptions` parity family would fail on, read from the jar: a tag or
 * reference that names no member, or several overloads, and a `@javaSource` member whose
 * resolution or fingerprint the golden does not record for the release.
 *
 * @param tags - The `@javaSource` tags.
 * @param references - The `@javaSee` tags.
 * @param golden - `packages/parity/goldens/java-sources.json`.
 * @param jar - The pinned jar, from {@link readPinnedJar}.
 * @returns One `file:line: message` line per problem.
 */
export const pinnedJarProblems = (
    tags: readonly JavaSourceTag[],
    references: readonly JavaReference[],
    golden: JavaSourceGolden,
    { version, index }: { readonly version: string; readonly index: JavaClassIndex }
): string[] => {
    const problems: string[] = [];
    const seen = new Set<string>();
    for (const tag of tags) {
        if (seen.has(`source ${tag.spelling}`)) continue;
        seen.add(`source ${tag.spelling}`);
        try {
            const member = resolveJavaSource(tag.spelling, index);
            const key = javaSourceKey(member);
            const stamped = golden.sources[key]?.[version];
            const fingerprint = javaSourceFingerprint(javaSourceListing(index.load, member));
            if (golden.names[tag.spelling] !== key)
                problems.push(
                    `${tag.file}:${tag.line}: ${tag.spelling} resolves to ${key}, the golden says ${golden.names[tag.spelling] ?? 'nothing'}`
                );
            else if (stamped !== fingerprint)
                problems.push(
                    `${tag.file}:${tag.line}: ${tag.spelling} has ${stamped === undefined ? 'no fingerprint' : 'another fingerprint'} for ${version} in the golden`
                );
        } catch (error) {
            problems.push(`${tag.file}:${tag.line}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    for (const reference of references) {
        if (seen.has(`see ${reference.spelling}`)) continue;
        seen.add(`see ${reference.spelling}`);
        try {
            resolveJavaSource(reference.spelling, index);
        } catch (error) {
            problems.push(
                `${reference.file}:${reference.line}: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
    return problems;
};

/**
 * Resolves every tag against the jar and stamps the release's fingerprints into the golden.
 *
 * @returns The problems that kept a tag from being stamped.
 */
const update = async (tags: readonly JavaSourceTag[], golden: JavaSourceGolden, reviewed: ReadonlySet<string>) => {
    const { version, index } = await readJar();

    const problems: string[] = [];
    const names: Record<string, string> = {};
    const sources: Record<string, Record<string, string>> = {};
    for (const tag of tags) {
        if (names[tag.spelling] !== undefined) continue;
        try {
            const member = resolveJavaSource(tag.spelling, index);
            const key = javaSourceKey(member);
            const fingerprint = javaSourceFingerprint(javaSourceListing(index.load, member));
            if (needsReview(golden.sources[key], fingerprint) && !reviewed.has(tag.spelling)) {
                problems.push(
                    `${tag.file}:${tag.line}: ${tag.spelling} changed in ${version}; read the new bytecode against the code, then pass --reviewed ${tag.spelling}`
                );
                continue;
            }
            names[tag.spelling] = key;
            sources[key] = { ...golden.sources[key], ...sources[key], [version]: fingerprint };
        } catch (error) {
            problems.push(`${tag.file}:${tag.line}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    // A member whose restamp was refused keeps its old entry, so the check still fails on it.
    for (const tag of tags) {
        const key = golden.names[tag.spelling];
        if (names[tag.spelling] !== undefined || key === undefined) continue;
        names[tag.spelling] = key;
        const releases = golden.sources[key];
        if (releases !== undefined) sources[key] = { ...releases };
    }
    writeFileSync(goldenPath, formatJavaSourceGolden({ names, sources }));
    console.log(
        `Stamped ${Object.keys(sources).length} Java sources for ${version} from ${Object.keys(names).length} tag spellings.`
    );
    return problems;
};

if (import.meta.filename === process.argv[1]) {
    const lists = flagValues(process.argv, '--list');
    if (lists.length > 0) {
        const { version, index } = await readJar();
        for (const spelling of lists) {
            console.log(`# ${spelling} in ${version}`);
            console.log(javaSourceListing(index.load, resolveJavaSource(spelling, index)).join('\n'));
        }
    } else if (process.argv.includes('--update')) {
        const tags = [...scanRepository(repoRoot).values()].flatMap((scan) => scan.tags);
        const problems = await update(
            tags,
            readJavaSourceGolden(goldenPath),
            new Set(flagValues(process.argv, '--reviewed'))
        );
        for (const problem of problems) console.error(problem);
        if (problems.length > 0) process.exitCode = 1;
    } else {
        console.error(
            'Pass --update [--reviewed <spelling>]... or --list <spelling>, with an optional --java <release>.'
        );
        process.exitCode = 1;
    }
}
