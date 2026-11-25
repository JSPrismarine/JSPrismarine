import { fileURLToPath } from 'node:url';

import { javaSourceFingerprint, javaSourceKey, javaSourceListing } from '@jsprismarine/java-classfile/fingerprint';
import type { JavaReference, JavaSourceTag } from '@jsprismarine/java-classfile/sources';
import { readJavaSourceGolden, resolveJavaSource, scanRepository } from '@jsprismarine/java-classfile/sources';
import { expect, it } from 'vitest';

import { FAMILIES } from './families.ts';
import { pinnedClassFile, pinnedJavaClassNames } from './javaClassFile.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES, pinnedJavaDataVersion } from './references.ts';
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
