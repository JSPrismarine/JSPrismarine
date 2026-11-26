/**
 * Checks the `@javaSource` tags against their golden, without the jar.
 *
 * A `@javaSource` tag names the Java method or field the declaration under it copies
 * (docs/plans/java-transcriptions.md). `packages/parity/goldens/java-sources.json` maps each tag
 * spelling to the member it resolves to, and each member to the fingerprint of its bytecode per
 * Java release. The `java.transcriptions` parity family compares those fingerprints with the
 * pinned jar, and `pnpm --filter @jsprismarine/bedrock-data run java:sources --update` stamps them.
 *
 * This check fails on a malformed tag, on a tag whose spelling the golden does not name, and on a
 * golden entry no tag uses. When the pinned jar is cached it also resolves every `@javaSource` and
 * `@javaSee` tag in it and compares the fingerprints, as the parity family does in CI. It also
 * counts the ``Java's `X.y` `` citations in JSDoc comments without a tag, per file, against
 * `scripts/java-sources-baseline.json`, which only shrinks: `--update-baseline` lowers it.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    JAVA_SOURCE_TAG,
    goldenProblems,
    readJavaSourceGolden,
    scanRepository
} from '../tools/java-classfile/src/sources.mts';
import { pinnedJarProblems, readPinnedJar } from '../packages/bedrock-data/utils/java-sources/run.ts';

import type { Counts } from './rule-baseline.mts';
import { runBaselineCheck } from './rule-baseline.mts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const goldenPath = path.join(repoRoot, 'packages', 'parity', 'goldens', 'java-sources.json');
const baselinePath = path.join(repoRoot, 'scripts', 'java-sources-baseline.json');

const RULE = 'untaggedJavaCitation';

if (import.meta.filename === process.argv[1]) {
    const scans = scanRepository(repoRoot);
    const tags = [...scans.values()].flatMap((scan) => scan.tags);
    const problems = [
        ...[...scans.values()].flatMap((scan) =>
            scan.problems.map((problem) => `${problem.file}:${problem.line}: ${problem.message}`)
        ),
        ...goldenProblems(tags, readJavaSourceGolden(goldenPath))
    ];
    // With the pinned jar cached, as `pnpm test` and `pnpm dev` leave it, the tags are also
    // resolved in it, so an overloaded or renamed member fails here before it fails the
    // java.transcriptions parity family in CI.
    const jar = await readPinnedJar();
    if (jar === undefined) {
        console.log(
            'The pinned Java server jar is not cached, so the tags were not resolved in it; `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` fetches it.'
        );
    } else {
        const references = [...scans.values()].flatMap((scan) => scan.references);
        problems.push(...pinnedJarProblems(tags, references, readJavaSourceGolden(goldenPath), jar));
    }
    if (problems.length > 0) {
        for (const problem of problems) console.error(problem);
        console.error(
            `\n${problems.length} Java tag problems. Spell an overloaded member with its descriptor, and run \`pnpm --filter @jsprismarine/bedrock-data run java:sources --update\` after adding or removing a ${JAVA_SOURCE_TAG} tag (docs/plans/java-transcriptions.md).`
        );
        process.exitCode = 1;
    }
    const found: Counts<typeof RULE> = {};
    for (const [file, scan] of scans) if (scan.untaggedCitations > 0) found[file] = { [RULE]: scan.untaggedCitations };
    runBaselineCheck({
        rules: [RULE],
        found,
        baselinePath,
        update: process.argv.includes('--update-baseline'),
        name: 'Java citation',
        updateCommand: 'node scripts/check-java-sources.mts --update-baseline',
        added: (files) =>
            `${files} files cite Java code in a JSDoc comment with no ${JAVA_SOURCE_TAG} tag. Tag the member the code copies; the baseline never grows.`,
        passed: `${tags.length} ${JAVA_SOURCE_TAG} and ${scans.values().reduce((sum, scan) => sum + scan.references.length, 0)} @javaSee tags read, and no new untagged Java citations`
    });
}
