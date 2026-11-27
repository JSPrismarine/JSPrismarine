import { fileURLToPath } from 'node:url';

import type { JavaSourceMember } from '@jsprismarine/java-classfile/fingerprint';
import {
    JavaSourceError,
    javaSourceFingerprint,
    javaSourceKey,
    javaSourceListing
} from '@jsprismarine/java-classfile/fingerprint';
import type { JavaClassIndex, JavaReference, JavaSourceTag } from '@jsprismarine/java-classfile/sources';
import {
    javaSourceKindCounts,
    needsReview,
    readJavaSourceGolden,
    resolveJavaSource,
    scanRepository
} from '@jsprismarine/java-classfile/sources';
import { expect, it } from 'vitest';

import type { BehaviorScenario } from './behaviorScenarios.ts';
import { measureScenarios, scenarioGroup } from './behaviorScenarios.ts';
import { FAMILIES } from './families.ts';
import { jarClassFile, jarClassNames, pinnedClassFile, pinnedJavaClassNames } from './javaClassFile.ts';
import { describeFamily } from './measure.ts';
import { reportParityProgress } from './progress.ts';
import { REFERENCES, pinnedJavaDataVersion, previewJavaVersion } from './references.ts';
import type { ParityTrackerRecord } from './trackerCases.ts';
import { reportParityCases } from './trackerCases.ts';

/**
 * The `java.transcriptions` row: each Java method or field a `@javaSource` tag names, against the
 * fingerprint of its bytecode that `goldens/java-sources.json` records for the pinned release.
 *
 * A tag marks TypeScript that copies Java code (docs/plans/java-transcriptions.md). The row
 * resolves each tag in the pinned jar and fingerprints what it names, so a Java release that
 * changes a copied method fails the row and names the code that copies it, instead of leaving a
 * comment that no longer says what Java does. A `@javaSee` tag, which names a member a comment
 * compares with rather than copies, only has to resolve.
 *
 * With the preview's jar cached, as a Java bring-up leaves it, each tag is also fingerprinted in
 * the preview. A member the preview changed, moved or removed is a `deferred` row with the
 * preview's id in `goldens/behavior-gaps.json`, since the server runs the default release until
 * the preview replaces it. Its row passes once the golden records the preview's fingerprint for
 * the member, which `java:sources --update --java <preview> --reviewed <spelling>` stamps after
 * someone has read the change against the copy.
 *
 * The family also reports how many tags each `@javaVerified` kind has, overall and per package, as
 * dashboard measurements, so the share of plain transcriptions, which only a re-read checks, shows.
 */

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const golden = readJavaSourceGolden(fileURLToPath(new URL('../goldens/java-sources.json', import.meta.url)));

const scans = [...scanRepository(repoRoot).values()];

/** Tags grouped by spelling, with the places that use each. */
const bySpelling = <Tag extends JavaReference>(tags: readonly Tag[]): Map<string, Tag[]> => {
    const grouped = new Map<string, Tag[]>();
    for (const tag of tags) grouped.set(tag.spelling, [...(grouped.get(tag.spelling) ?? []), tag]);
    return grouped;
};

/** The pinned jar's classes, as the tags resolve against them. */
const pinnedIndex = () => ({ names: pinnedJavaClassNames('net/minecraft/'), load: pinnedClassFile });

/** The preview jar's classes. */
const previewIndex = (): JavaClassIndex => ({
    names: jarClassNames(REFERENCES.javaPreviewServerJar, 'net/minecraft/'),
    load: (name) => jarClassFile(REFERENCES.javaPreviewServerJar, name)
});

/**
 * What the preview does differently to a tagged member, or undefined when the golden records the
 * member's preview fingerprint under some release.
 *
 * @param spelling - The tag's spelling.
 * @param index - The preview jar's classes.
 */
const previewDifference = (spelling: string, index: JavaClassIndex): string | undefined => {
    let member: JavaSourceMember;
    try {
        member = resolveJavaSource(spelling, index);
    } catch (error) {
        // A member the preview removed or renamed is a difference to read, not a broken row.
        if (error instanceof JavaSourceError) return `does not resolve: ${error.message}`;
        throw error;
    }
    const key = javaSourceKey(member);
    if (golden.names[spelling] !== key)
        return `resolves to ${key}, the golden says ${golden.names[spelling] ?? 'nothing'}`;
    const fingerprint = javaSourceFingerprint(javaSourceListing(index.load, member));
    return needsReview(golden.sources[key], fingerprint) ? 'changed its bytecode' : undefined;
};

describeFamily(FAMILIES.javaTranscriptions, [REFERENCES.javaServerJar], () => {
    it('finds every tagged Java member in the pinned jar with the fingerprint the golden records', () => {
        const release = pinnedJavaDataVersion() ?? 'unknown';
        const index = pinnedIndex();

        const records: ParityTrackerRecord[] = [];
        const failures: string[] = [];
        for (const [spelling, tags] of bySpelling<JavaSourceTag>(scans.flatMap((scan) => scan.tags))) {
            const sites = tags.map((tag) => `${tag.file}:${tag.line}`).join(', ');
            let details: string | undefined;
            try {
                const member = resolveJavaSource(spelling, index);
                const key = javaSourceKey(member);
                const fingerprint = javaSourceFingerprint(javaSourceListing(pinnedClassFile, member));
                const stamped = golden.sources[key]?.[release];
                if (golden.names[spelling] !== key)
                    details = `resolves to ${key}, the golden says ${golden.names[spelling] ?? 'nothing'}`;
                else if (stamped === undefined) details = `has no fingerprint for ${release}`;
                else if (stamped !== fingerprint)
                    details = `changed in ${release}: the golden has ${stamped}, the jar ${fingerprint}`;
            } catch (error) {
                details = error instanceof Error ? error.message : String(error);
            }
            records.push({
                id: `transcription/${spelling}`,
                title: spelling,
                context: sites,
                status: details === undefined ? 'passed' : 'failed',
                ...(details === undefined ? {} : { details })
            });
            if (details !== undefined) failures.push(`${spelling} (${sites}) ${details}`);
        }
        reportParityCases(FAMILIES.javaTranscriptions, import.meta.filename, records);

        // Read the changed Java code against each site and fix the copy where Java changed, then
        // restamp with `java:sources --update --reviewed <spelling>` in @jsprismarine/bedrock-data.
        expect(failures).toEqual([]);
        expect(records.length).toBeGreaterThan(0);
    });

    it('finds every member a @javaSee tag names in the pinned jar', () => {
        const index = pinnedIndex();
        const records: ParityTrackerRecord[] = [];
        const failures: string[] = [];
        for (const [spelling, references] of bySpelling(scans.flatMap((scan) => scan.references))) {
            const sites = references.map((reference) => `${reference.file}:${reference.line}`).join(', ');
            let details: string | undefined;
            try {
                resolveJavaSource(spelling, index);
            } catch (error) {
                details = error instanceof Error ? error.message : String(error);
            }
            records.push({
                id: `reference/${spelling}`,
                title: spelling,
                context: sites,
                status: details === undefined ? 'passed' : 'failed',
                ...(details === undefined ? {} : { details })
            });
            if (details !== undefined) failures.push(`${spelling} (${sites}) ${details}`);
        }
        reportParityCases(FAMILIES.javaTranscriptions, import.meta.filename, records);

        // A reference that stopped resolving names a member the release renamed or moved.
        expect(failures).toEqual([]);
    });
});

describeFamily(FAMILIES.javaTranscriptions, [REFERENCES.javaPreviewServerJar], () => {
    it('reports each tagged Java member the preview changes as deferred until the preview is the default', () => {
        const preview = previewJavaVersion() ?? 'unknown';
        const index = previewIndex();
        const tags = bySpelling<JavaSourceTag>(scans.flatMap((scan) => scan.tags));
        const scenario: BehaviorScenario<string> = {
            name: 'preview',
            java: `Java ${preview} keeps the bytecode of the member the code copies.`,
            reference: `Java ${preview}`,
            subjects: () => [...tags.keys()].sort(),
            idOf: (spelling) => spelling,
            covers: () => undefined,
            run: (spelling) => {
                const difference = previewDifference(spelling, index);
                return difference === undefined ? undefined : `${difference} in ${preview}`;
            },
            classify: (spelling, difference) => ({
                kind: 'deferred',
                reason: `${spelling} ${difference}. The server runs the default release until ${preview} replaces it; read the change against ${(tags.get(spelling) ?? []).map((tag) => tag.file).join(', ')} then.`,
                reference: `Java ${preview}`
            })
        };
        const rows = measureScenarios(FAMILIES.javaTranscriptions, import.meta.filename, scenarioGroup([scenario]));

        expect(rows.length).toBe(tags.size);
    });
});

describeFamily(FAMILIES.javaTranscriptions, [], () => {
    it('reports the tags by verification kind and by package', () => {
        const tags = scans.flatMap((scan) => scan.tags);
        const counts = javaSourceKindCounts(tags);
        reportParityProgress(FAMILIES.javaTranscriptions, counts);

        // Each tag is counted once overall and once under its package.
        const overall = ['plain', 'vectors', 'read', 'extracted'].reduce((sum, kind) => sum + (counts[kind] ?? 0), 0);
        expect(overall).toBe(tags.length);
        expect(
            Object.entries(counts)
                .filter(([name]) => name.includes(': '))
                .reduce((sum, [, n]) => sum + n, 0)
        ).toBe(tags.length);
    });
});
