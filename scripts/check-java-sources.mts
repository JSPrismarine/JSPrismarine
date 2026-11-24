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
 * golden entry no tag uses. It also counts the ``Java's `X.y` `` citations in JSDoc comments
 * without a tag, per file, against `scripts/java-sources-baseline.json`, which only shrinks:
 * `--update-baseline` lowers it.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    JAVA_SOURCE_TAG,
    goldenProblems,
    readJavaSourceGolden,
    scanRepository
} from '../tools/java-classfile/src/sources.mts';

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
    if (problems.length > 0) {
        for (const problem of problems) console.error(problem);
        console.error(
            `\n${problems.length} ${JAVA_SOURCE_TAG} problems. Run \`pnpm --filter @jsprismarine/bedrock-data run java:sources --update\` after adding or removing a tag (docs/plans/java-transcriptions.md).`
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
        passed: `${tags.length} ${JAVA_SOURCE_TAG} tags read, and no new untagged Java citations`
    });
}
