import type { JavaClass, JavaCodeMethod } from './classFile.mts';
import { ACC_BRIDGE, ACC_PRIVATE, ACC_STATIC, ACC_SYNTHETIC } from './classFile.mts';
import type { JavaSourceMember } from './fingerprint.mts';
import { JavaSourceError } from './fingerprint.mts';
import type { JavaClassIndex } from './sources.mts';
import { JAVA_SEE_TAG, JAVA_SOURCE_TAG, jsdocComments, resolveJavaSource } from './sources.mts';

/**
 * The codemod that turns prose citations of Java (``Java's `Class.member` ``) into `@javaSource`
 * and `@javaSee` tags, one package at a time (docs/plans/java-transcriptions.md, slice 3).
 *
 * A citation is read as the code a maintainer wrote it as: a simple class name, nested classes
 * joined with dots, a member, and sometimes an argument list. {@link spellCitation} finds the
 * member in the jar, walking up to the class that declares an inherited member and choosing an
 * overload by the cited argument types, and {@link tagCitations} adds the tags to each JSDoc
 * comment whose citations all resolve. What it cannot settle is reported for a person to tag.
 */

/** A citation as the comments write one, up to its closing backtick. */
const CITATION = /Java's `([A-Z][\w$]*(?:\.[\w$]+)+)(\([^`)]*\))?[^`]*`/g;

/** A citation resolved to one member. */
export interface ResolvedCitation {
    readonly kind: 'resolved';
    /** The tag spelling, with the declaring class and a descriptor when either is needed. */
    readonly spelling: string;
    readonly member: JavaSourceMember;
    /** Whether the member is an abstract method or an instance field, which a fingerprint cannot follow. */
    readonly abstract: boolean;
}

/** What a citation resolved to. */
export type CitationSpelling = ResolvedCitation | { readonly kind: 'unresolved'; readonly reason: string };

const simpleName = (binaryName: string): string => binaryName.slice(binaryName.lastIndexOf('/') + 1);

/** The simple class name of each parameter in a method descriptor, `I` and `[I` for primitives. */
const parameterNames = (descriptor: string): string[] => {
    const names: string[] = [];
    const end = descriptor.indexOf(')');
    for (let at = 1; at < end;) {
        let dims = '';
        while (descriptor[at] === '[') {
            dims += '[';
            at++;
        }
        if (descriptor[at] === 'L') {
            const close = descriptor.indexOf(';', at);
            names.push(dims + simpleName(descriptor.slice(at + 1, close)).replace(/.*\$/, ''));
            at = close + 1;
        } else {
            names.push(dims + (descriptor[at] ?? ''));
            at++;
        }
    }
    return names;
};

/** Java's spelling of each primitive descriptor letter, so `next(int)` matches `(I)I`. */
const PRIMITIVES: Readonly<Record<string, string>> = {
    Z: 'boolean',
    B: 'byte',
    C: 'char',
    S: 'short',
    I: 'int',
    J: 'long',
    F: 'float',
    D: 'double'
};

/**
 * Whether a cited argument list, such as `(List, RandomSource)` or `(level, pos)`, matches a
 * descriptor's parameters: the same count, and each argument that starts with a capital or is a
 * primitive's name names the parameter's type.
 */
const argumentsMatch = (cited: string, descriptor: string): boolean => {
    const inner = cited.slice(1, -1).trim();
    const args = inner === '' ? [] : inner.split(',').map((argument) => argument.trim().replace(/<.*>/, ''));
    const parameters = parameterNames(descriptor);
    if (args.length !== parameters.length) return false;
    return args.every((argument, at) => {
        const parameter = parameters[at] ?? '';
        if (Object.values(PRIMITIVES).includes(argument)) return PRIMITIVES[parameter] === argument;
        if (/^[A-Z]/.test(argument)) return argument.replace(/\[\]$/, '') === parameter.replace(/^\[/, '');
        // A lowercase argument is a variable name, which says nothing about the type.
        return true;
    });
};

/** The class a simple name, with nested parts joined by `$`, names, when exactly one does. */
const findClass = (name: string, index: JavaClassIndex): string | undefined => {
    const matches = index.names.filter((candidate) => simpleName(candidate) === name);
    if (matches.length > 0) return matches.length === 1 ? matches[0] : undefined;
    // A nested class cited without its outer class, such as `PhantomSweepAttackGoal`.
    const nested = index.names.filter((candidate) => candidate.endsWith(`$${name}`));
    return nested.length === 1 ? nested[0] : undefined;
};

/** A class's simple name when no other class has it, as a tag spells it, or its binary name. */
const tagClassName = (binaryName: string, index: JavaClassIndex): string => {
    const short = simpleName(binaryName);
    return index.names.filter((candidate) => simpleName(candidate) === short).length === 1 ? short : binaryName;
};

/** A resolved method, spelled without a descriptor when the bare name already picks it. */
const spellMethod = (owner: string, method: JavaCodeMethod, index: JavaClassIndex): ResolvedCitation => {
    const bare = `${tagClassName(owner, index)}.${method.name}`;
    let spelling = `${bare}(${method.descriptor.slice(1)}`;
    try {
        if (resolveJavaSource(bare, index).descriptor === method.descriptor) spelling = bare;
    } catch (error) {
        if (!(error instanceof JavaSourceError)) throw error;
    }
    return {
        kind: 'resolved',
        spelling,
        member: { owner, name: method.name, descriptor: method.descriptor },
        abstract: method.code === undefined
    };
};

/**
 * The methods a citation of a whole nested class, such as `SnifferAi.Digging`, stands for: each
 * method with code the class declares, without constructors, bridges, lambdas and private helpers,
 * which the fingerprint of the methods that call them already lists.
 *
 * @param path - The citation's dotted path.
 * @param index - The jar's classes.
 * @returns The methods, or undefined when the path names no nested class.
 */
export const spellClassCitation = (path: string, index: JavaClassIndex): ResolvedCitation[] | undefined => {
    const owner = findClass(path.split('.').join('$'), index);
    if (owner === undefined || !owner.includes('$')) return undefined;
    const parsed = index.load(owner);
    if (parsed === undefined) return undefined;
    const skipped = ACC_BRIDGE | ACC_PRIVATE | ACC_SYNTHETIC;
    return parsed.methods
        .filter(
            (method) => method.code !== undefined && (method.access & skipped) === 0 && !method.name.startsWith('<')
        )
        .map((method) => spellMethod(owner, method, index));
};

/**
 * Resolves one citation's class path, member and argument list to a tag spelling.
 *
 * The class path's dots name nested classes: `Fox.FoxPanicGoal.canUse` is the member `canUse` of
 * `Fox$FoxPanicGoal`. A member the class inherits resolves to the superclass or interface that
 * declares it, since that is what the fingerprint reads. Of a field and one method sharing a
 * name, the method is chosen; of several overloads, the one the cited arguments match.
 *
 * @param path - The citation's dotted path, such as `Mob.setTarget`.
 * @param cited - The argument list after it, with parentheses, when the citation has one.
 * @param index - The jar's classes.
 */
export const spellCitation = (path: string, cited: string | undefined, index: JavaClassIndex): CitationSpelling => {
    const parts = path.split('.');
    const name = parts.pop() ?? '';
    const owner = findClass(parts.join('$'), index);
    if (owner === undefined) return { kind: 'unresolved', reason: `no single class ${parts.join('$')} in the jar` };

    // Breadth first through the superclasses and interfaces, so the nearest declaration wins.
    const pending = [owner];
    const seen = new Set<string>();
    for (let at = 0; at < pending.length; at++) {
        const current = pending[at] ?? '';
        if (seen.has(current)) continue;
        seen.add(current);
        const parsed: JavaClass | undefined = index.load(current);
        if (parsed === undefined) continue;
        const methods = parsed.methods.filter((method) => method.name === name && (method.access & ACC_BRIDGE) === 0);
        const fields = parsed.fields.filter((field) => field.name === name);
        if (methods.length + fields.length > 0) {
            const className = tagClassName(current, index);
            let chosen = methods;
            if (methods.length > 1 && cited !== undefined)
                chosen = methods.filter((method) => argumentsMatch(cited, method.descriptor));
            const field = fields[0];
            if (methods.length === 0 && fields.length === 1 && field !== undefined) {
                const spelling = `${className}.${name}`;
                // An instance field has no value of its own to fingerprint, so a comment that names
                // one describes state the code keeps, and the code that sets it is what a tag copies.
                const instance = (field.access & ACC_STATIC) === 0;
                return { kind: 'resolved', spelling, member: { owner: current, name }, abstract: instance };
            }
            const method = chosen[0];
            if (chosen.length !== 1 || method === undefined)
                return {
                    kind: 'unresolved',
                    reason: `${current}.${name} is overloaded: ${methods.map((m) => m.descriptor).join(', ')}`
                };
            return spellMethod(current, method, index);
        }
        if (parsed.superName !== undefined) pending.push(parsed.superName);
        pending.push(...parsed.interfaces);
    }
    return { kind: 'unresolved', reason: `${owner} and its supertypes declare no ${name}` };
};

/** One citation the codemod could not tag, for a person to settle. */
export interface UntaggedCitation {
    readonly line: number;
    readonly citation: string;
    readonly reason: string;
}

/** What {@link tagCitations} did to one file. */
export interface TaggedFile {
    /** The file's text with the tags added. */
    readonly text: string;
    /** The tags added, as `line: @tag spelling`, the line counted in the original text. */
    readonly added: readonly { readonly line: number; readonly tag: string; readonly spelling: string }[];
    readonly untagged: readonly UntaggedCitation[];
}

/**
 * Whether a comment only describes: it documents a type, whose citations say what a host does
 * rather than copy it, or no declaration at all, as a file's or a section's overview does.
 *
 * @param after - The text after the comment's close.
 */
const onlyDescribes = (after: string): boolean => {
    if (/^[^\S\n]*\n[^\S\n]*\n/.test(after)) return true;
    const next = after.trimStart();
    return (
        next === '' ||
        /^(?:\/\/|\/\*|import\s)/.test(next) ||
        /^(?:export\s+)?(?:declare\s+)?(?:interface|type)\s/.test(next) ||
        isMemberSignature(next.split('\n', 1)[0] ?? '')
    );
};

/**
 * Whether a line is an interface member's signature, such as `name?: Type;` or
 * `name(arg: A): B;`: a name, an optional parameter list, then a type with no `=` or `{` up to a
 * closing semicolon. Read by index rather than one regular expression, which would backtrack
 * polynomially between the parameter list and the type.
 */
const isMemberSignature = (line: string): boolean => {
    const head = /^(?:readonly\s+)?[\w$]+\??\s*/.exec(line);
    if (head === null) return false;
    let rest = line.slice(head[0].length);
    if (rest.startsWith('(')) {
        const close = rest.lastIndexOf(')');
        if (close < 0) return false;
        rest = rest.slice(close + 1).trimStart();
    }
    const type = rest.trimEnd();
    return type.startsWith(':') && type.endsWith(';') && !/[={]/.test(type.slice(1, -1));
};

/**
 * Adds a tag line for each member a JSDoc comment's citations name, to every comment of a file
 * whose citations all resolve and that carries no Java tag yet.
 *
 * A citation of an abstract method or an instance field, or one in a comment that documents a type or no declaration,
 * becomes `@javaSee`, since nothing there copies code. The rest become `@javaSource`. A citation
 * of a nested class in a comment on code, such as a `Behavior` subclass a function copies, tags
 * each of the class's methods.
 *
 * A person settles the rest with hints: the tag lines, such as `@javaSource Mth.floor(D)I`, for a
 * citation's dotted path, or for its path and argument list as the comment writes them, which wins.
 * A hint line that is only a spelling takes `@javaSee` or `@javaSource` by the comment's place.
 * A comment with a citation that does not resolve is left whole, so a person reads all of it.
 *
 * @param text - The file's contents.
 * @param index - The jar's classes.
 * @param hints - Tag lines by citation, for the citations the jar cannot settle alone.
 */
export const tagCitations = (
    text: string,
    index: JavaClassIndex,
    hints: ReadonlyMap<string, readonly string[]> = new Map()
): TaggedFile => {
    const added: { line: number; tag: string; spelling: string }[] = [];
    const untagged: UntaggedCitation[] = [];
    const edits: { start: number; end: number; replacement: string }[] = [];
    for (const { body, startLine, start } of jsdocComments(text)) {
        if (body.includes(JAVA_SOURCE_TAG) || body.includes(JAVA_SEE_TAG)) continue;
        const citations = [...body.matchAll(CITATION)];
        if (citations.length === 0) continue;
        const describes = onlyDescribes(text.slice(start + body.length));
        const tags = new Map<string, string>();
        const problems: UntaggedCitation[] = [];
        for (const citation of citations) {
            const line = startLine + body.slice(0, citation.index).split('\n').length - 1;
            const hint = hints.get(`${citation[1] ?? ''}${citation[2] ?? ''}`) ?? hints.get(citation[1] ?? '');
            if (hint !== undefined) {
                for (const tagLine of hint) {
                    // A bare spelling takes the tag the comment's place decides, as a resolved one does.
                    const [first = '', second] = tagLine.split(/\s+/);
                    const spelling = second ?? first;
                    const tag = second === undefined ? (describes ? JAVA_SEE_TAG : JAVA_SOURCE_TAG) : first;
                    if (!tags.has(spelling)) tags.set(spelling, tag);
                }
                continue;
            }
            const resolved = spellCitation(citation[1] ?? '', citation[2], index);
            const members =
                resolved.kind === 'resolved'
                    ? [resolved]
                    : describes
                      ? undefined
                      : spellClassCitation(citation[1] ?? '', index);
            if (members === undefined || members.length === 0) {
                problems.push({
                    line,
                    citation: citation[0],
                    reason: resolved.kind === 'unresolved' ? resolved.reason : 'names a class with no code'
                });
                continue;
            }
            for (const member of members)
                if (!tags.has(member.spelling))
                    tags.set(member.spelling, describes || member.abstract ? JAVA_SEE_TAG : JAVA_SOURCE_TAG);
        }
        if (problems.length > 0) {
            untagged.push(...problems);
            continue;
        }
        const lines = [...tags].map(([spelling, tag]) => `${tag} ${spelling}`);
        for (const [spelling, tag] of tags) added.push({ line: startLine, tag, spelling });
        edits.push({ start, end: start + body.length, replacement: withTags(body, text, start, lines) });
    }
    let result = text;
    for (const edit of edits.reverse())
        result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
    return { text: result, added, untagged };
};

/** A comment with tag lines added before its close, widened to several lines when it was one. */
const withTags = (body: string, text: string, start: number, tags: readonly string[]): string => {
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const indent = /^\s*/.exec(text.slice(lineStart, start))?.[0] ?? '';
    const tagLines = tags.map((tag) => `${indent} * ${tag}`).join('\n');
    if (!body.includes('\n')) {
        const content = body.slice(3, -2).trim();
        return `/**\n${indent} * ${content}\n${indent} *\n${tagLines}\n${indent} */`;
    }
    const lines = body.split('\n');
    const close = lines.pop() ?? '';
    const last = lines.at(-1)?.trim() ?? '';
    // A comment whose last line already holds a tag gets the new ones in that block; prose gets a
    // blank line first, as JSDoc separates its description from its tags.
    const separator = /^\*\s*@/.test(last) || last === '*' ? '' : `${indent} *\n`;
    if (close.trim() !== '*/') {
        // Text on the closing line: move the close to a line of its own.
        const content = close.trim().slice(0, -2).trimEnd();
        return [...lines, `${indent} * ${content.replace(/^\*\s?/, '')}`, `${indent} *`, tagLines, `${indent} */`].join(
            '\n'
        );
    }
    return `${lines.join('\n')}\n${separator}${tagLines}\n${close}`;
};
