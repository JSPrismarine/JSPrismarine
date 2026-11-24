import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { JavaClass } from './classFile.mts';
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

/** The JSDoc tag that says how a copy is checked beyond its fingerprint. */
export const JAVA_VERIFIED_TAG = '@javaVerified';

/** The kinds `@javaVerified` accepts. */
export const JAVA_VERIFIED_KINDS = ['vectors', 'read', 'extracted'] as const;

/** A tag's spelling: an optional package path, a class with nested `$` parts, a member, and a descriptor. */
const SPELLING = /^(?:[a-z0-9_]+\/)*[A-Za-z0-9_$]+\.[A-Za-z_$][\w$]*(?:\([^\s)]*\)\S+)?$/;

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

/** A tag the scan could not accept. */
export interface JavaSourceProblem {
    readonly file: string;
    readonly line: number;
    readonly message: string;
}

/** What one file holds: its tags, its malformed tags, and its prose citations of Java in untagged JSDoc. */
export interface JavaSourceScan {
    readonly tags: readonly JavaSourceTag[];
    readonly problems: readonly JavaSourceProblem[];
    /** ``Java's `Class.member` `` citations in JSDoc comments that carry no `@javaSource`. */
    readonly untaggedCitations: number;
}

/** A prose citation of a Java class's member, as the code's comments write one. */
const CITATION = /Java's `[A-Z][\w$]*\.[a-zA-Z_$][\w$]*/g;

/**
 * Reads the tags and untagged citations out of one TypeScript file's JSDoc comments.
 *
 * @param file - The file, relative to the repository root, as the results name it.
 * @param text - The file's contents.
 */
export const scanJavaSources = (file: string, text: string): JavaSourceScan => {
    const tags: JavaSourceTag[] = [];
    const problems: JavaSourceProblem[] = [];
    let untaggedCitations = 0;
    for (const comment of text.matchAll(/\/\*\*[\s\S]*?\*\//g)) {
        const body = comment[0];
        const startLine = text.slice(0, comment.index).split('\n').length;
        const lines = body.split('\n');
        const commentTags: { line: number; spelling: string }[] = [];
        let verified: string | undefined;
        for (const [offset, raw] of lines.entries()) {
            const line = startLine + offset;
            const content = raw.replace(/^\s*(?:\/\*\*|\*(?!\/))?\s?/, '').replace(/\s*\*\/\s*$/, '');
            const source = new RegExp(`(?:^|\\s)${JAVA_SOURCE_TAG}(?:\\s+(\\S+))?`).exec(content);
            if (source !== null) {
                const spelling = source[1];
                if (spelling === undefined || !SPELLING.test(spelling))
                    problems.push({
                        file,
                        line,
                        message: `${JAVA_SOURCE_TAG} needs Class.member, got "${spelling ?? ''}"`
                    });
                else commentTags.push({ line, spelling });
            }
            const check = new RegExp(`(?:^|\\s)${JAVA_VERIFIED_TAG}(?:\\s+(\\S+))?`).exec(content);
            if (check !== null) {
                const kind = check[1];
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
        if (commentTags.length === 0) untaggedCitations += [...body.matchAll(CITATION)].length;
    }
    return { tags, problems, untaggedCitations };
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
    } catch {
        return { names: {}, sources: {} };
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

    const methods = parsed.methods.filter(
        (method) => method.name === name && (descriptor === undefined || method.descriptor === descriptor)
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
