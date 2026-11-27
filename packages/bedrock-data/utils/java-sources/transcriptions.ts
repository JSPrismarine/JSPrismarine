/**
 * What a new Java release does to the code the server copies: the `transcriptions` stage of
 * `bringup:java` (docs/plans/java-transcriptions.md, "On a new release").
 *
 * It fingerprints every member a `@javaSource` tag names in the previous release's jar and in the
 * new one, and writes a "Transcriptions to re-read" section into the release's delta note with:
 *
 * - each changed member, the TypeScript that tags it, and the diff of its listing;
 * - each member the new release removed or renamed, with the closest new member as a hint;
 * - each changed method of another class that a tagged member calls and no tag names, which is
 *   advisory, since the fingerprint counts calls into other classes by name only.
 *
 * The stage calls {@link writeTranscriptionsNote}, and so does this script, to rewrite the section
 * without a whole bring-up after a review:
 *
 * ```sh
 * pnpm --filter @jsprismarine/bedrock-data run java:transcriptions --java 26.4-pre-1
 * ```
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { JavaSourceMember } from '@jsprismarine/java-classfile/fingerprint';
import {
    JavaSourceError,
    javaSourceFingerprint,
    javaSourceKey,
    javaSourceListing
} from '@jsprismarine/java-classfile/fingerprint';
import type { JavaClassIndex, JavaSourceTag } from '@jsprismarine/java-classfile/sources';
import { resolveJavaSource, scanRepository } from '@jsprismarine/java-classfile/sources';

import { fetchSource } from '../fetch/fetch.ts';
import { resolveJavaRelease } from '../java/release.ts';
import { cacheRoot } from '../java/worldgen-cache.ts';
import { readPinnedJar } from './run.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** One release's jar, as {@link readPinnedJar} reads it. */
export interface ReleaseJar {
    readonly version: string;
    readonly index: JavaClassIndex;
}

/** A tagged member whose listing differs between the releases. */
export interface ChangedTranscription {
    readonly spelling: string;
    readonly key: string;
    /** The `file:line` of each tag that names the member. */
    readonly sites: readonly string[];
    /** The listing's diff, `-` for the previous release's lines and `+` for the new one's. */
    readonly diff: readonly string[];
}

/** A tagged member the new release no longer resolves the same way. */
export interface RemovedTranscription {
    readonly spelling: string;
    readonly sites: readonly string[];
    readonly reason: string;
    /** The member of the new release that looks most like it, as Markdown, as a hint for a rename. */
    readonly closest: string | undefined;
}

/** A method in another class that tagged members call, whose listing changed. */
export interface ChangedCallee {
    readonly key: string;
    /** The tag spellings whose members call it. */
    readonly callers: readonly string[];
}

/** What {@link compareTranscriptions} found. */
export interface TranscriptionDelta {
    readonly previous: string;
    readonly release: string;
    readonly unchanged: number;
    readonly changed: readonly ChangedTranscription[];
    readonly removed: readonly RemovedTranscription[];
    readonly callees: readonly ChangedCallee[];
}

/** The heading of the section the stage owns in a delta note. */
export const TRANSCRIPTIONS_HEADING = '## Transcriptions to re-read';

/** How many lines of unchanged listing a diff shows around each change. */
const CONTEXT = 2;

/** How many diff lines the note shows for one member; `java:sources --list` prints the rest. */
const SHOWN_DIFF_LINES = 60;

/**
 * A listing line without its instruction number, so an instruction added near the top of a method
 * does not show every later line as changed. Branch targets keep their numbers, which is how a
 * moved jump still shows.
 */
const withoutIndex = (line: string): string => line.replace(/^(\s*)\d+: /, '$1');

/**
 * The lines two listings differ by, with {@link CONTEXT} unchanged lines around each run of
 * changes and `…` between runs. A longest-common-subsequence diff, which is exact for the few
 * hundred lines a listing has.
 *
 * @param before - The previous release's listing.
 * @param after - The new release's listing.
 */
export const diffListings = (before: readonly string[], after: readonly string[]): string[] => {
    const rows = before.length + 1;
    const columns = after.length + 1;
    const lengths = new Uint32Array(rows * columns);
    for (let i = before.length - 1; i >= 0; i--)
        for (let j = after.length - 1; j >= 0; j--)
            lengths[i * columns + j] =
                before[i] === after[j]
                    ? (lengths[(i + 1) * columns + j + 1] ?? 0) + 1
                    : Math.max(lengths[(i + 1) * columns + j] ?? 0, lengths[i * columns + j + 1] ?? 0);
    const lines: { readonly mark: ' ' | '-' | '+'; readonly text: string }[] = [];
    let i = 0;
    let j = 0;
    while (i < before.length || j < after.length) {
        if (i < before.length && j < after.length && before[i] === after[j]) {
            lines.push({ mark: ' ', text: before[i++] ?? '' });
            j++;
        } else if (
            i < before.length &&
            (j === after.length || (lengths[(i + 1) * columns + j] ?? 0) >= (lengths[i * columns + j + 1] ?? 0))
        ) {
            lines.push({ mark: '-', text: before[i++] ?? '' });
        } else {
            lines.push({ mark: '+', text: after[j++] ?? '' });
        }
    }
    const shown = lines.map((_, at) =>
        lines.slice(Math.max(0, at - CONTEXT), at + CONTEXT + 1).some((line) => line.mark !== ' ')
    );
    const output: string[] = [];
    for (const [at, line] of lines.entries()) {
        if (!shown[at]) continue;
        if (at > 0 && !shown[at - 1] && output.length > 0) output.push('…');
        output.push(`${line.mark} ${line.text}`);
    }
    return output;
};

/** The listing of a member, or undefined when the jar cannot list it. */
const listingOf = (index: JavaClassIndex, member: JavaSourceMember): string[] | undefined => {
    try {
        return javaSourceListing(index.load, member);
    } catch (error) {
        if (error instanceof JavaSourceError) return undefined;
        throw error;
    }
};

/** A member reference `owner.name descriptor` that an `invoke*` line of a listing names. */
const INVOKE = /^\s*\d+: invoke(?:virtual|special|static|interface) (\S+)\.([^\s.]+) (\(\S*)$/;

/**
 * The method a call resolves to: the named class's own, or the nearest supertype's, since a call
 * names the class of the receiver rather than the class that declares the method.
 */
const declaredMethod = (
    index: JavaClassIndex,
    owner: string,
    name: string,
    descriptor: string
): JavaSourceMember | undefined => {
    const pending = [owner];
    const seen = new Set<string>();
    for (let at = 0; at < pending.length; at++) {
        const current = pending[at] ?? '';
        if (seen.has(current)) continue;
        seen.add(current);
        const parsed = index.load(current);
        if (parsed === undefined) continue;
        if (parsed.methods.some((method) => method.name === name && method.descriptor === descriptor))
            return { owner: current, name, descriptor };
        if (parsed.superName !== undefined) pending.push(parsed.superName);
        pending.push(...parsed.interfaces);
    }
    return undefined;
};

/** The share of one listing's distinct instruction texts the other also has, for a rename hint. */
const similarity = (left: readonly string[], right: readonly string[]): number => {
    const strip = (line: string): string => line.replace(/^\s*\d+: /, '');
    const a = new Set(left.map(strip));
    const b = new Set(right.map(strip));
    let shared = 0;
    for (const line of a) if (b.has(line)) shared++;
    return shared / Math.max(1, a.size + b.size - shared);
};

/** The score a new member needs to be offered as a rename: a matching descriptor, or close code. */
const HINT_SCORE = 0.5;

/** The class at or above `owner` that declares a member with the same name and descriptor. */
const declaredIn = (index: JavaClassIndex, owner: string, member: JavaSourceMember): string | undefined => {
    for (let current: string | undefined = owner; current !== undefined;) {
        const parsed = index.load(current);
        if (parsed === undefined) return undefined;
        const found =
            member.descriptor === undefined
                ? parsed.fields.some((field) => field.name === member.name)
                : parsed.methods.some(
                      (method) => method.name === member.name && method.descriptor === member.descriptor
                  );
        if (found) return `${current}.${member.name}${member.descriptor ?? ''}`;
        current = parsed.superName;
    }
    return undefined;
};

/**
 * The new release's member that looks most like one it no longer has: the same member on a
 * superclass, a member of the same class that the previous release lacked, scored by descriptor and
 * listing similarity, or a class of the same simple name elsewhere when the class itself moved.
 */
const closestMember = (
    member: JavaSourceMember,
    listing: readonly string[] | undefined,
    previous: JavaClassIndex,
    next: JavaClassIndex
): string | undefined => {
    const simple = member.owner.slice(member.owner.lastIndexOf('/') + 1);
    const nextClass = next.load(member.owner);
    if (nextClass === undefined) {
        const moved = next.names.filter((name) => name.endsWith(`/${simple}`) && name !== member.owner);
        return moved.length === 0
            ? undefined
            : `${moved.map((name) => `\`${name}\``).join(', ')}, where the class moved`;
    }
    const inherited = nextClass.superName === undefined ? undefined : declaredIn(next, nextClass.superName, member);
    if (inherited !== undefined) return `\`${inherited}\`, which a superclass declares now`;
    const before = previous.load(member.owner);
    const existed = new Set([
        ...(before?.methods ?? []).map((method) => `${method.name}${method.descriptor}`),
        ...(before?.fields ?? []).map((field) => field.name)
    ]);
    let best: { readonly spelling: string; readonly score: number } | undefined;
    for (const method of nextClass.methods) {
        if (existed.has(`${method.name}${method.descriptor}`) || method.name.startsWith('lambda$')) continue;
        const candidate = { owner: member.owner, name: method.name, descriptor: method.descriptor };
        const score =
            (method.descriptor === member.descriptor ? 1 : 0) +
            (listing === undefined ? 0 : similarity(listing, listingOf(next, candidate) ?? []));
        if (score >= HINT_SCORE && (best === undefined || score > best.score))
            best = { spelling: javaSourceKey(candidate), score };
    }
    if (member.descriptor === undefined)
        for (const field of nextClass.fields)
            if (!existed.has(field.name) && best === undefined)
                best = { spelling: `${member.owner}.${field.name}`, score: 0 };
    return best === undefined ? undefined : `\`${best.spelling}\``;
};

/**
 * Fingerprints every tagged member in both releases and sorts them into unchanged, changed and
 * removed, and lists the changed methods of other classes that the tagged members call.
 *
 * @param tags - Every `@javaSource` tag.
 * @param previous - The release the golden was stamped against, usually the default.
 * @param next - The release being brought up.
 */
export const compareTranscriptions = (
    tags: readonly JavaSourceTag[],
    previous: ReleaseJar,
    next: ReleaseJar
): TranscriptionDelta => {
    const sites = new Map<string, string[]>();
    for (const tag of tags) sites.set(tag.spelling, [...(sites.get(tag.spelling) ?? []), `${tag.file}:${tag.line}`]);

    const changed: ChangedTranscription[] = [];
    const removed: RemovedTranscription[] = [];
    let unchanged = 0;
    const tagged = new Set<string>();
    const callers = new Map<string, { readonly member: JavaSourceMember; readonly spellings: Set<string> }>();
    for (const [spelling, where] of [...sites].sort(([left], [right]) => left.localeCompare(right, 'en'))) {
        let member: JavaSourceMember;
        try {
            member = resolveJavaSource(spelling, previous.index);
        } catch (error) {
            if (!(error instanceof JavaSourceError)) throw error;
            removed.push({
                spelling,
                sites: where,
                reason: `${previous.version}: ${error.message}`,
                closest: undefined
            });
            continue;
        }
        const key = javaSourceKey(member);
        tagged.add(key);
        const before = listingOf(previous.index, member) ?? [];
        for (const line of before) {
            const call = INVOKE.exec(line);
            if (call === null || call[1] === member.owner || !call[1]?.startsWith('net/minecraft/')) continue;
            const callee = declaredMethod(previous.index, call[1], call[2] ?? '', call[3] ?? '');
            if (callee === undefined) continue;
            const calleeKey = javaSourceKey(callee);
            const entry = callers.get(calleeKey) ?? { member: callee, spellings: new Set<string>() };
            entry.spellings.add(spelling);
            callers.set(calleeKey, entry);
        }

        let nextKey: string;
        try {
            nextKey = javaSourceKey(resolveJavaSource(spelling, next.index));
        } catch (error) {
            if (!(error instanceof JavaSourceError)) throw error;
            removed.push({
                spelling,
                sites: where,
                reason: error.message.replace(`${spelling}: `, ''),
                closest: closestMember(member, before, previous.index, next.index)
            });
            continue;
        }
        if (nextKey !== key) {
            removed.push({
                spelling,
                sites: where,
                reason: `resolves to ${nextKey}, not ${key}`,
                closest: `\`${nextKey}\``
            });
            continue;
        }
        const after = listingOf(next.index, member) ?? [];
        if (javaSourceFingerprint(before) === javaSourceFingerprint(after)) unchanged++;
        else
            changed.push({
                spelling,
                key,
                sites: where,
                diff: diffListings(before.map(withoutIndex), after.map(withoutIndex))
            });
    }

    const callees: ChangedCallee[] = [];
    for (const [key, { member, spellings }] of [...callers].sort(([left], [right]) =>
        left.localeCompare(right, 'en')
    )) {
        if (tagged.has(key)) continue;
        const before = listingOf(previous.index, member);
        const after = listingOf(next.index, member);
        if (
            before === undefined ||
            (after !== undefined && javaSourceFingerprint(before) === javaSourceFingerprint(after))
        )
            continue;
        callees.push({ key, callers: [...spellings].sort() });
    }
    return { previous: previous.version, release: next.version, unchanged, changed, removed, callees };
};

/**
 * The delta note section for a comparison, starting with {@link TRANSCRIPTIONS_HEADING}.
 *
 * @param delta - What {@link compareTranscriptions} found.
 */
export const renderTranscriptions = (delta: TranscriptionDelta): string => {
    const { previous, release } = delta;
    const total = delta.unchanged + delta.changed.length + delta.removed.length;
    const lines = [
        TRANSCRIPTIONS_HEADING,
        '',
        `Written by \`pnpm run bringup:java --java ${release}\`, which fingerprints every member a`,
        `\`@javaSource\` tag names in the ${previous} and ${release} jars.`,
        '',
        `| Tagged members | Changed | Gone or moved | Unchanged |`,
        '| -------------- | ------- | ------------- | --------- |',
        `| ${total} | ${delta.changed.length} | ${delta.removed.length} | ${delta.unchanged} |`,
        '',
        'Read each change against the code that tags it, fix the copy where Java changed, and',
        `restamp with \`java:sources --update --java ${release} --reviewed <spelling>\`. The`,
        `\`java.transcriptions\` parity family reports the unread ones as deferred until ${release} is the`,
        'default.',
        ''
    ];
    lines.push('### Changed', '');
    if (delta.changed.length === 0) lines.push('None.', '');
    for (const change of delta.changed) {
        lines.push(`#### \`${change.spelling}\``, '');
        lines.push(`Tagged at ${change.sites.map((site) => `\`${site}\``).join(', ')}.`, '');
        const hidden = change.diff.length - SHOWN_DIFF_LINES;
        lines.push('```diff', ...change.diff.slice(0, SHOWN_DIFF_LINES), '```', '');
        if (hidden > 0)
            lines.push(
                `${hidden} more lines. \`java:sources --list '${change.spelling}'\` prints the listing under each \`--java\`.`,
                ''
            );
    }
    lines.push('### Removed or renamed', '');
    if (delta.removed.length === 0) lines.push('None.', '');
    for (const gone of delta.removed) {
        const hint = gone.closest === undefined ? '' : ` The closest ${release} member is ${gone.closest}.`;
        lines.push(
            `- \`${gone.spelling}\`, tagged at ${gone.sites.map((site) => `\`${site}\``).join(', ')}: ${gone.reason}.${hint}`
        );
    }
    if (delta.removed.length > 0) lines.push('');
    lines.push(
        '### Changed callees',
        '',
        'Advisory. Methods of other classes that tagged members call, that no tag names, and whose',
        `bytecode changed in ${release}. Read each one and tag it, or note why it does not matter to the copy.`,
        ''
    );
    if (delta.callees.length === 0) lines.push('None.', '');
    for (const callee of delta.callees)
        lines.push(`- \`${callee.key}\`, called by ${callee.callers.map((caller) => `\`${caller}\``).join(', ')}`);
    if (delta.callees.length > 0) lines.push('');
    return lines.join('\n');
};

/**
 * Writes a section into a delta note: in place of the section with the same heading when the note
 * has one, before its `## Sources` section otherwise, or at the end.
 *
 * @param path - The delta note.
 * @param section - The section, starting with its `## ` heading.
 * @returns Whether the note existed; a missing note is created with the section alone.
 */
export const writeDeltaSection = (path: string, section: string): boolean => {
    const heading = section.slice(0, section.indexOf('\n'));
    const body = `${section.trimEnd()}\n`;
    if (!existsSync(path)) {
        writeFileSync(path, body);
        return false;
    }
    const note = readFileSync(path, 'utf8');
    const lines = note.split('\n');
    const start = lines.indexOf(heading);
    if (start >= 0) {
        const end = lines.findIndex((line, at) => at > start && line.startsWith('## '));
        const after = end < 0 ? '' : `\n${lines.slice(end).join('\n')}`;
        writeFileSync(path, `${lines.slice(0, start).join('\n')}\n${body}${after}`);
        return true;
    }
    const sources = lines.indexOf('## Sources');
    if (sources >= 0)
        writeFileSync(path, `${lines.slice(0, sources).join('\n')}\n${body}\n${lines.slice(sources).join('\n')}`);
    else writeFileSync(path, `${note.trimEnd()}\n\n${body}`);
    return true;
};

/**
 * Compares a release's tagged members with the default release's and writes the section into
 * `docs/research/java-<release>-delta.md`, fetching the default release's jar when it is missing.
 *
 * @param release - The release being brought up; its jar must be in the cache.
 * @returns What was found, the note's path relative to the repository, and whether the note
 *   existed, or undefined for the default release, which has nothing to compare with.
 * @throws Error when a jar is not in the cache.
 */
export const writeTranscriptionsNote = async (
    release: string
): Promise<{ readonly delta: TranscriptionDelta; readonly note: string; readonly existed: boolean } | undefined> => {
    const defaultRelease = await resolveJavaRelease([]);
    if (defaultRelease.version === release) return undefined;
    await fetchSource(defaultRelease, { cacheRoot });
    const previous = await readPinnedJar(['--java', defaultRelease.version]);
    const next = await readPinnedJar(['--java', release]);
    if (previous === undefined) throw new Error(`the Java ${defaultRelease.version} server jar is not in the cache`);
    if (next === undefined)
        throw new Error(
            `the Java ${release} server jar is not in the cache; run \`pnpm --filter @jsprismarine/bedrock-data run fetch:sources --java ${release}\``
        );
    const tags = [...scanRepository(repoRoot).values()].flatMap((scan) => scan.tags);
    const delta = compareTranscriptions(tags, previous, next);
    const path = join(repoRoot, 'docs', 'research', `java-${release}-delta.md`);
    const existed = writeDeltaSection(path, renderTranscriptions(delta));
    return { delta, note: relative(repoRoot, path), existed };
};

if (import.meta.filename === process.argv[1]) {
    const release = (await resolveJavaRelease(process.argv)).version;
    const written = await writeTranscriptionsNote(release);
    if (written === undefined) console.log(`${release} is the default release; java.transcriptions checks it.`);
    else
        console.log(
            `${written.delta.changed.length} changed, ${written.delta.removed.length} removed or renamed and ` +
                `${written.delta.callees.length} changed callees; wrote ${written.note}`
        );
}
