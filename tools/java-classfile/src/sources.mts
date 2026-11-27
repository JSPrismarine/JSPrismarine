import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { JavaClass } from './classFile.mts';
import { ACC_BRIDGE } from './classFile.mts';
import type { JavaSourceMember } from './fingerprint.mts';
import { JavaSourceError } from './fingerprint.mts';

/**
 * The `@javaSource` tags in the repository's TypeScript, the golden that fingerprints what they
 * name, and the resolution of a tag's spelling to one member of the jar.
 *
 * A tag names the Java method or field the declaration under it copies:
 *
 *     /** @javaSource SpongeBlock.removeWaterBreadthFirstSearch *\/
 *
 * The class is a simple name when one class of the jar has it, or a binary name. An overloaded
 * method adds its descriptor: `Mob.setTarget(Lnet/minecraft/world/entity/LivingEntity;)V`.
 */

/** The JSDoc tag that names a Java source. */
export const JAVA_SOURCE_TAG = '@javaSource';

/**
 * The JSDoc tag that names a Java member a comment compares with, or describes, without copying
 * it. The checks resolve it in the jar and do not fingerprint it.
 */
export const JAVA_SEE_TAG = '@javaSee';

/** The JSDoc tag that says how a copy is checked beyond its fingerprint. */
export const JAVA_VERIFIED_TAG = '@javaVerified';

/** The kinds `@javaVerified` accepts. */
export const JAVA_VERIFIED_KINDS = ['vectors', 'read', 'extracted'] as const;

/**
 * Whether a tag's spelling is an optional package path, a class with nested `$` parts, a member
 * or `<init>` for a constructor that sets a field the code copies,
 * and an optional descriptor. Each part is checked on its own, so no pattern backtracks across the
 * whole spelling.
 */
const isSpelling = (spelling: string): boolean => {
    const paren = spelling.indexOf('(');
    const path = paren < 0 ? spelling : spelling.slice(0, paren);
    if (paren >= 0 && !/^\([^\s)]*\)\S+$/.test(spelling.slice(paren))) return false;
    const dot = path.lastIndexOf('.');
    if (dot < 0 || !/^(?:[A-Za-z_$][\w$]*|<init>)$/.test(path.slice(dot + 1))) return false;
    const segments = path.slice(0, dot).split('/');
    const className = segments.pop() ?? '';
    return /^[A-Za-z0-9_$]+$/.test(className) && segments.every((segment) => /^[a-z0-9_]+$/.test(segment));
};

/** One tag in a source file. */
export interface JavaSourceTag {
    /** The file, relative to the repository root. */
    readonly file: string;
    readonly line: number;
    /** What follows the tag, such as `SpongeBlock.removeWaterBreadthFirstSearch`. */
    readonly spelling: string;
    /** The `@javaVerified` kind in the same comment, when it has one. */
    readonly verified: string | undefined;
}

/** One `@javaSee` tag in a source file. */
export interface JavaReference {
    /** The file, relative to the repository root. */
    readonly file: string;
    readonly line: number;
    /** What follows the tag, such as `RandomSource.nextInt(I)I`. */
    readonly spelling: string;
}

/** A tag the scan could not accept. */
export interface JavaSourceProblem {
    readonly file: string;
    readonly line: number;
    readonly message: string;
}

/** What one file holds: its tags, its malformed tags, and its prose citations of Java in untagged JSDoc. */
export interface JavaSourceScan {
    readonly tags: readonly JavaSourceTag[];
    readonly references: readonly JavaReference[];
    readonly problems: readonly JavaSourceProblem[];
    /** ``Java's `Class.member` `` citations in JSDoc comments that carry neither `@javaSource` nor `@javaSee`. */
    readonly untaggedCitations: number;
}

/** A prose citation of a Java class's member, as the code's comments write one. */
const CITATION = /Java's `[A-Z][\w$]*\.[a-zA-Z_$][\w$]*/g;

/** The spelling after a tag on one comment line, or null when the line has no such tag. */
const tagSpelling = (tag: string, content: string): { readonly spelling: string | undefined } | null => {
    const words = content.split(/\s+/);
    const at = words.indexOf(tag);
    return at < 0 ? null : { spelling: words[at + 1] || undefined };
};

/**
 * Each JSDoc comment in a file, with the line and offset it starts at. A scan by `indexOf` rather
 * than a regular expression, which takes time polynomial in the input on a file of unclosed `/**`.
 */
export function* jsdocComments(
    text: string
): Generator<{ readonly body: string; readonly startLine: number; readonly start: number }> {
    let line = 1;
    let counted = 0;
    for (let start = text.indexOf('/**'); start >= 0;) {
        const end = text.indexOf('*/', start + 3);
        if (end < 0) return;
        for (let at = text.indexOf('\n', counted); at >= 0 && at < start; at = text.indexOf('\n', at + 1)) line++;
        counted = start;
        yield { body: text.slice(start, end + 2), startLine: line, start };
        start = text.indexOf('/**', end + 2);
    }
}

/** A comment line without its leading `/**` or `*` and its closing `*\/`. */
const commentContent = (raw: string): string => {
    let content = raw.trimStart();
    if (content.startsWith('/**')) content = content.slice(3);
    else if (content.startsWith('*') && !content.startsWith('*/')) content = content.slice(1);
    if (content.startsWith(' ')) content = content.slice(1);
    content = content.trimEnd();
    return content.endsWith('*/') ? content.slice(0, -2).trimEnd() : content;
};

/**
 * Reads the tags and untagged citations out of one TypeScript file's JSDoc comments.
 *
 * @param file - The file, relative to the repository root, as the results name it.
 * @param text - The file's contents.
 */
export const scanJavaSources = (file: string, text: string): JavaSourceScan => {
    const tags: JavaSourceTag[] = [];
    const references: JavaReference[] = [];
    const problems: JavaSourceProblem[] = [];
    let untaggedCitations = 0;
    for (const { body, startLine } of jsdocComments(text)) {
        const lines = body.split('\n');
        const commentTags: { line: number; spelling: string }[] = [];
        const commentReferences: { line: number; spelling: string }[] = [];
        let verified: string | undefined;
        for (const [offset, raw] of lines.entries()) {
            const line = startLine + offset;
            const content = commentContent(raw);
            for (const [tag, found] of [
                [JAVA_SOURCE_TAG, commentTags],
                [JAVA_SEE_TAG, commentReferences]
            ] as const) {
                const match = tagSpelling(tag, content);
                if (match === null) continue;
                const { spelling } = match;
                if (spelling === undefined || !isSpelling(spelling))
                    problems.push({ file, line, message: `${tag} needs Class.member, got "${spelling ?? ''}"` });
                else found.push({ line, spelling });
            }
            const check = tagSpelling(JAVA_VERIFIED_TAG, content);
            if (check !== null) {
                const kind = check.spelling;
                if (kind === undefined || !JAVA_VERIFIED_KINDS.some((known) => known === kind))
                    problems.push({
                        file,
                        line,
                        message: `${JAVA_VERIFIED_TAG} takes one of ${JAVA_VERIFIED_KINDS.join(', ')}, got "${kind ?? ''}"`
                    });
                else verified = kind;
            }
        }
        if (verified !== undefined && commentTags.length === 0)
            problems.push({ file, line: startLine, message: `${JAVA_VERIFIED_TAG} without ${JAVA_SOURCE_TAG}` });
        for (const tag of commentTags) tags.push({ file, ...tag, verified });
        for (const reference of commentReferences) references.push({ file, ...reference });
        if (commentTags.length === 0 && commentReferences.length === 0)
            untaggedCitations += [...body.matchAll(CITATION)].length;
    }
    return { tags, references, problems, untaggedCitations };
};

/**
 * How many `@javaSource` tags each `@javaVerified` kind has, overall and per package, with
 * `plain` for a tag without one. The dashboard reports these, so the share of copies only a re-read
 * checks is visible and can shrink as copies move to vectors or extracted data.
 *
 * @param tags - Every tag in the repository.
 * @returns Counts keyed `<kind>` and `<package>: <kind>`, a package being the directory under
 *   `packages/`, with every kind present in both forms.
 */
export const javaSourceKindCounts = (tags: readonly JavaSourceTag[]): Record<string, number> => {
    const kinds = ['plain', ...JAVA_VERIFIED_KINDS];
    const counts: Record<string, number> = Object.fromEntries(kinds.map((kind) => [kind, 0]));
    for (const tag of tags) {
        const kind = tag.verified ?? 'plain';
        const pkg = /^packages\/([^/]+)\//.exec(tag.file)?.[1] ?? tag.file;
        for (const name of kinds) counts[`${pkg}: ${name}`] ??= 0;
        counts[kind] = (counts[kind] ?? 0) + 1;
        counts[`${pkg}: ${kind}`] = (counts[`${pkg}: ${kind}`] ?? 0) + 1;
    }
    return counts;
};

/**
 * The files a tag may sit in: package sources, without tests and generated output. The parity
 * suite reads Java code to compare with it rather than copying it, so its citations are not
 * transcriptions.
 */
const SOURCES = 'packages/*/src/**/*.ts';
const EXCLUDED = [
    'packages/parity/**',
    '**/*.test.*',
    '**/*.test-utils.*',
    '**/*.d.ts',
    'packages/bedrock-data/src/generated/**',
    'packages/bedrock-data/src/jsp/**',
    'packages/minecraft/src/generated/**'
];

/**
 * Whether a file is one {@link scanRepository} reads, so a change to it can change what the tags
 * say.
 *
 * @param file - The file, relative to the repository root, with forward slashes.
 */
export const isScannedSource = (file: string): boolean =>
    path.posix.matchesGlob(file, SOURCES) && !EXCLUDED.some((pattern) => path.posix.matchesGlob(file, pattern));

/**
 * Scans every package source file of the repository.
 *
 * @param root - The repository root.
 * @returns Each file's scan, by path relative to the root, in path order.
 */
export const scanRepository = (root: string): Map<string, JavaSourceScan> =>
    new Map(
        globSync(SOURCES, { cwd: root, exclude: EXCLUDED })
            .sort()
            .map((file) => {
                const relative = file.split(path.sep).join('/');
                return [relative, scanJavaSources(relative, readFileSync(path.join(root, file), 'utf8'))] as const;
            })
    );

/** The golden: which member each spelling names, and each member's fingerprint by Java release. */
export interface JavaSourceGolden {
    /** Each tag spelling in use, and the key of the member it resolves to. */
    readonly names: Readonly<Record<string, string>>;
    /** Each member's fingerprint by release id, keyed as `javaSourceKey` spells it. */
    readonly sources: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

const isStringRecord = (value: unknown): value is Record<string, string> =>
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === 'string');

/**
 * Reads the golden file, or an empty golden when it does not exist yet.
 *
 * @param path - The golden's absolute path.
 * @throws {Error} When the file is not a golden.
 */
export const readJavaSourceGolden = (path: string): JavaSourceGolden => {
    let text: string;
    try {
        text = readFileSync(path, 'utf-8');
    } catch (error) {
        // Only a golden that does not exist yet is empty. Any other read error has to stop an
        // update, which would otherwise stamp every member as new and skip the review gate.
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return { names: {}, sources: {} };
        throw error;
    }
    // Parsed JSON boundary; checked field by field below.
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || !('names' in parsed) || !('sources' in parsed))
        throw new Error(`${path} is not a Java source golden`);
    const { names, sources } = parsed;
    if (!isStringRecord(names)) throw new Error(`${path}: names must map spellings to keys`);
    if (typeof sources !== 'object' || sources === null || !Object.values(sources).every(isStringRecord))
        throw new Error(`${path}: sources must map keys to fingerprints by release`);
    return { names, sources: Object.fromEntries(Object.entries(sources).filter((entry) => isStringRecord(entry[1]))) };
};

/** The golden as the committed file spells it, with its keys sorted. */
export const formatJavaSourceGolden = (golden: JavaSourceGolden): string => {
    const sorted = <T,>(record: Readonly<Record<string, T>>): Record<string, T> =>
        Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
    return `${JSON.stringify(
        {
            names: sorted(golden.names),
            sources: Object.fromEntries(
                Object.entries(sorted(golden.sources)).map(([key, releases]) => [key, sorted(releases)])
            )
        },
        null,
        4
    )}\n`;
};

/**
 * What a tag set and the golden disagree on, with no jar: a spelling the golden does not name, a
 * name no tag uses any more, and a member no name points at.
 *
 * @param tags - Every tag in the repository.
 * @param golden - The committed golden.
 */
export const goldenProblems = (tags: readonly JavaSourceTag[], golden: JavaSourceGolden): string[] => {
    const problems: string[] = [];
    const spellings = new Set(tags.map((tag) => tag.spelling));
    for (const tag of tags)
        if (golden.names[tag.spelling] === undefined)
            problems.push(`${tag.file}:${tag.line}: ${tag.spelling} has no fingerprint in the golden`);
    for (const spelling of Object.keys(golden.names))
        if (!spellings.has(spelling)) problems.push(`the golden names ${spelling}, which no tag uses`);
    const named = new Set(Object.values(golden.names));
    for (const key of Object.keys(golden.sources))
        if (!named.has(key)) problems.push(`the golden fingerprints ${key}, which no name points at`);
    for (const [spelling, key] of Object.entries(golden.names))
        if (golden.sources[key] === undefined)
            problems.push(`the golden names ${spelling} as ${key}, with no fingerprint`);
    return problems;
};

/**
 * Whether a new fingerprint for a member needs `--reviewed` before it is stamped.
 *
 * It does when the golden already records the member under any release and none of those
 * fingerprints is the new one. Comparing with every recorded release, rather than only the one
 * being stamped, keeps the first stamp for a new release behind the same review: a member that
 * changed between 26.3 and 26.4 differs from 26.3's fingerprint even though 26.4 has none yet. A
 * fingerprint some release already has was reviewed when that release was stamped.
 *
 * @param stamped - The member's fingerprints by release, or undefined for a member the golden
 *   does not record.
 * @param fingerprint - The fingerprint about to be stamped.
 */
export const needsReview = (stamped: Readonly<Record<string, string>> | undefined, fingerprint: string): boolean =>
    stamped !== undefined && Object.keys(stamped).length > 0 && !Object.values(stamped).includes(fingerprint);

/** The classes of a jar, by binary name, and a reader for each. */
export interface JavaClassIndex {
    /** Every class's binary name. */
    readonly names: readonly string[];
    readonly load: (binaryName: string) => JavaClass | undefined;
}

/**
 * Resolves a tag's spelling to one member of the jar.
 *
 * @param spelling - The tag's spelling.
 * @param index - The jar's classes.
 * @throws {JavaSourceError} When the spelling names no member, or more than one.
 */
export const resolveJavaSource = (spelling: string, index: JavaClassIndex): JavaSourceMember => {
    const paren = spelling.indexOf('(');
    const path = paren < 0 ? spelling : spelling.slice(0, paren);
    const descriptor = paren < 0 ? undefined : spelling.slice(paren);
    const dot = path.lastIndexOf('.');
    const classPart = path.slice(0, dot);
    const name = path.slice(dot + 1);

    let owner = classPart;
    if (!classPart.includes('/')) {
        const matches = index.names.filter(
            (candidate) => candidate.slice(candidate.lastIndexOf('/') + 1) === classPart
        );
        if (matches.length === 0) throw new JavaSourceError(`${spelling}: the jar holds no class ${classPart}`);
        if (matches.length > 1)
            throw new JavaSourceError(`${spelling}: ${classPart} is ambiguous, spell one of ${matches.join(', ')}`);
        owner = matches[0] ?? classPart;
    }
    const parsed = index.load(owner);
    if (parsed === undefined) throw new JavaSourceError(`${spelling}: the jar holds no class ${owner}`);

    // A bridge only forwards to the override it was written for, so it is never what code copies,
    // and the short spelling names the override.
    const methods = parsed.methods.filter(
        (method) =>
            method.name === name &&
            (descriptor === undefined ? (method.access & ACC_BRIDGE) === 0 : method.descriptor === descriptor)
    );
    const fields = descriptor === undefined ? parsed.fields.filter((field) => field.name === name) : [];
    if (methods.length + fields.length === 0) throw new JavaSourceError(`${spelling}: ${owner} declares no ${name}`);
    if (methods.length + fields.length > 1)
        throw new JavaSourceError(
            `${spelling}: ${owner}.${name} is overloaded, add one of ${methods.map((method) => method.descriptor).join(', ')}`
        );
    const method = methods[0];
    return method === undefined ? { owner, name } : { owner, name, descriptor: method.descriptor };
};
