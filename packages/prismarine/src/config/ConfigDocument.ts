import {
    applyEdits,
    createScanner,
    findNodeAtLocation,
    modify,
    parse,
    parseTree,
    printParseErrorCode
} from 'jsonc-parser';
import type { Node as JsonNode, ParseError } from 'jsonc-parser';
import { isCollection, isMap, isNode, isPair, isScalar, isSeq, parseDocument } from 'yaml';
import type { Document as YamlDocumentNode } from 'yaml';

/** The file formats a config document can be kept in. */
export type ConfigFormat = 'json' | 'yaml';

/** Every supported {@link ConfigFormat}, in the order error messages list them. */
export const CONFIG_FORMATS: readonly ConfigFormat[] = ['json', 'yaml'];

/** The keys from the root to one value: object keys as strings, list indices as numbers. */
export type ConfigPath = readonly (string | number)[];

/** The indentation every file this server writes uses. */
const INDENT = 4;

/**
 * A config file held as text, edited one path at a time.
 *
 * Reading parses the text; writing changes only the part of the text the path names, so a
 * comment or a blank line a person put in the file stays where it was. Replacing a value
 * replaces everything under it, including comments inside a replaced list or map, since
 * there is nothing to attach them to afterwards.
 */
export interface ConfigDocument {
    /**
     * The plain value at `path`, or `undefined` when nothing is there.
     *
     * An empty path returns the whole document.
     */
    get(path: ConfigPath): unknown;

    /** Whether something is stored at `path`, even if it is `null`. */
    has(path: ConfigPath): boolean;

    /**
     * Stores `value` at `path`, creating the maps on the way.
     *
     * @param comment - Written above the key when the key is new; an existing key keeps the
     *   comment it already has, so calling this twice does not stack comments.
     */
    set(path: ConfigPath, value: unknown, comment?: string): void;

    /**
     * Removes `path`.
     *
     * A comment above the key stays in the file, above whatever follows it; a comment on the
     * same line as the value goes with the value.
     *
     * @returns Whether something was there to remove.
     */
    delete(path: ConfigPath): boolean;

    /** The file content, ending in a newline. */
    toString(): string;
}

/**
 * Raised when a config file cannot be read as its format.
 *
 * Thrown rather than swallowed on purpose. Treating a file with a typo in it as empty and then
 * writing the defaults back is how a server used to erase its own config; refusing to start
 * keeps the file for the person to fix.
 */
export class ConfigSyntaxError extends Error {
    public constructor(format: ConfigFormat, detail: string) {
        super(`Not valid ${format}: ${detail}`);
        this.name = 'ConfigSyntaxError';
    }
}

const endsWithNewline = (text: string): string => (text === '' || text.endsWith('\n') ? text : `${text}\n`);

const indentationAt = (depth: number): string => ' '.repeat(INDENT * depth);

const yamlCommentLines = (comment: string | null | undefined, depth: number): string[] =>
    comment === undefined || comment === null
        ? []
        : comment.split('\n').map((line) => {
              const content = line.startsWith(' ') ? line.slice(1) : line;
              return `${indentationAt(depth)}//${content === '' ? '' : ` ${content}`}`;
          });

const appendYamlCommaAndComment = (
    lines: string[],
    comma: boolean,
    comments: (string | null | undefined)[],
    depth: number
): string[] => {
    const result = [...lines];
    const last = result.length - 1;
    result[last] += comma ? ',' : '';

    const comment = comments.filter((entry) => entry !== undefined && entry !== null).join('\n');
    if (comment === '') return result;

    const parts = comment.split('\n');
    const first = parts.shift() ?? '';
    const firstContent = first.startsWith(' ') ? first.slice(1) : first;
    result[last] += ` //${firstContent === '' ? '' : ` ${firstContent}`}`;
    if (parts.length > 0) result.push(...yamlCommentLines(parts.join('\n'), depth));
    return result;
};

const jsonValue = (value: unknown): string => JSON.stringify(value) ?? 'null';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const yamlKey = (value: unknown): string | undefined => (isScalar(value) ? String(value.value) : undefined);

const renderYamlValue = (node: unknown, value: unknown, depth: number): string[] => {
    if (isMap(node) && isRecord(value)) return renderYamlMap(node, value, depth);
    if (isSeq(node) && Array.isArray(value)) return renderYamlSequence(node, value, depth);
    if (Array.isArray(value)) return renderPlainSequence(value, depth);
    if (isRecord(value)) return renderPlainMap(value, depth);
    return [jsonValue(value)];
};

const renderYamlMap = (node: unknown, value: Record<string, unknown>, depth: number): string[] => {
    if (!isMap(node)) return renderPlainMap(value, depth);
    const entries = Object.entries(value);
    if (entries.length === 0) return ['{}'];

    const lines = ['{'];
    entries.forEach(([key, child], index) => {
        const pair = node.items.find((candidate) => yamlKey(candidate.key) === key);
        const keyNode = pair?.key;
        const valueNode = pair?.value;
        const spaceBefore = (isNode(keyNode) && keyNode.spaceBefore) || (isNode(valueNode) && valueNode.spaceBefore);
        if (spaceBefore && lines.length > 1) lines.push('');
        if (isNode(keyNode)) lines.push(...yamlCommentLines(keyNode.commentBefore, depth + 1));
        if (isNode(valueNode)) lines.push(...yamlCommentLines(valueNode.commentBefore, depth + 1));

        const childLines = renderYamlValue(valueNode, child, depth + 1);
        const withComma = appendYamlCommaAndComment(
            [`${indentationAt(depth + 1)}${JSON.stringify(key)}: ${childLines[0]}`, ...childLines.slice(1)],
            index < entries.length - 1,
            [isNode(keyNode) ? keyNode.comment : undefined, isNode(valueNode) ? valueNode.comment : undefined],
            depth + 1
        );
        lines.push(...withComma);
    });

    lines.push(`${indentationAt(depth)}}`);
    return lines;
};

const renderYamlSequence = (node: unknown, value: unknown[], depth: number): string[] => {
    if (!isSeq(node)) return renderPlainSequence(value, depth);
    if (value.length === 0) return ['[]'];

    const lines = ['['];
    value.forEach((item, index) => {
        const itemNode = node.items[index];
        if (isNode(itemNode) && itemNode.spaceBefore && lines.length > 1) lines.push('');
        if (isNode(itemNode)) lines.push(...yamlCommentLines(itemNode.commentBefore, depth + 1));

        const itemLines = renderYamlValue(itemNode, item, depth + 1);
        const withComma = appendYamlCommaAndComment(
            [`${indentationAt(depth + 1)}${itemLines[0]}`, ...itemLines.slice(1)],
            index < value.length - 1,
            [isNode(itemNode) ? itemNode.comment : undefined],
            depth + 1
        );
        lines.push(...withComma);
    });

    lines.push(`${indentationAt(depth)}]`);
    return lines;
};

const renderPlainMap = (value: Record<string, unknown>, depth: number): string[] => {
    const entries = Object.entries(value);
    if (entries.length === 0) return ['{}'];

    const lines = ['{'];
    entries.forEach(([key, child], index) => {
        const childLines = renderYamlValue(undefined, child, depth + 1);
        lines.push(`${indentationAt(depth + 1)}${JSON.stringify(key)}: ${childLines[0]}`);
        lines.push(...childLines.slice(1));
        if (index < entries.length - 1) lines[lines.length - 1] += ',';
    });
    lines.push(`${indentationAt(depth)}}`);
    return lines;
};

const renderPlainSequence = (value: unknown[], depth: number): string[] => {
    if (value.length === 0) return ['[]'];

    const lines = ['['];
    value.forEach((item, index) => {
        const itemLines = renderYamlValue(undefined, item, depth + 1);
        lines.push(`${indentationAt(depth + 1)}${itemLines[0]}`);
        lines.push(...itemLines.slice(1));
        if (index < value.length - 1) lines[lines.length - 1] += ',';
    });
    lines.push(`${indentationAt(depth)}]`);
    return lines;
};

/** `# text` lines the way the yaml library wants them: one leading space per line, no `#`. */
const yamlComment = (comment: string): string =>
    comment
        .split('\n')
        .map((line) => ` ${line}`)
        .join('\n');

/**
 * A YAML file.
 *
 * Built on the `yaml` package's document model, which keeps comments and blank lines as part
 * of the tree, so the whole file can be written back after a change to one key.
 */
class YamlConfigDocument implements ConfigDocument {
    private readonly document: YamlDocumentNode;

    /** Whether the file held no values at all, so that `get([])` can say so rather than invent a map. */
    private blank: boolean;

    public constructor(text: string) {
        // Typed as a plain document so that blank-file contents can be swapped in below.
        const document: YamlDocumentNode = parseDocument(text, { keepSourceTokens: false });
        const [error] = document.errors;
        if (error) throw new ConfigSyntaxError('yaml', error.message.trim());

        // A blank file, or one holding only comments, has no contents node to add keys to.
        this.blank = document.contents === null;
        if (document.contents === null) document.contents = document.createNode({});
        if (!isCollection(document.contents)) {
            throw new ConfigSyntaxError('yaml', 'the document is a single value, not a map or a list');
        }

        this.document = document;
    }

    public get(path: ConfigPath): unknown {
        if (path.length === 0) return this.blank ? undefined : this.document.toJS();
        const node: unknown = this.document.getIn(path, true);
        return isNode(node) ? node.toJS(this.document) : node;
    }

    public has(path: ConfigPath): boolean {
        return path.length === 0 ? !this.blank : this.document.hasIn(path);
    }

    public set(path: ConfigPath, value: unknown, comment?: string): void {
        const node = this.document.createNode(value);
        const previous: unknown = this.document.getIn(path, true);
        const key = path.at(-1);
        this.blank = false;

        if (isNode(previous)) {
            // The comments ride on the value node, so a replaced value would take them with it:
            // `port: 19132 # the one players type in` keeps its remark when the number changes.
            node.comment = previous.comment;
            node.commentBefore = previous.commentBefore;
            node.spaceBefore = previous.spaceBefore;
        }

        if (previous !== undefined || comment === undefined || key === undefined || typeof key !== 'string') {
            this.document.setIn(path, node);
            return;
        }

        const parentPath = path.slice(0, -1);
        if (!this.document.hasIn(parentPath)) this.document.setIn(parentPath, this.document.createNode({}));
        const parent: unknown = this.document.getIn(parentPath, true);
        if (!isMap(parent)) {
            this.document.setIn(path, node);
            return;
        }

        const pair = this.document.createPair(key, node);
        pair.key.commentBefore = yamlComment(comment);
        pair.key.spaceBefore = true;
        parent.add(pair);
    }

    public delete(path: ConfigPath): boolean {
        const key = path.at(-1);
        const parent: unknown = key === undefined ? undefined : this.document.getIn(path.slice(0, -1), true);
        if (key === undefined || !isCollection(parent)) return this.document.deleteIn(path);

        // The comment above a key lives on the key node, so deleting the pair would take the
        // comment along. Hand it to whatever follows instead, as the JSON side leaves it be.
        const index = parent.items.findIndex((item: unknown, position) => {
            const itemKey: unknown = isPair(item) ? item.key : position;
            return (isScalar(itemKey) ? itemKey.value : itemKey) === key;
        });
        if (index === -1) return false;

        const removed: unknown = parent.items[index];
        const removedNode: unknown = isPair(removed) ? removed.key : removed;
        const comment = isNode(removedNode) ? removedNode.commentBefore : undefined;
        const spaceBefore = isNode(removedNode) ? removedNode.spaceBefore : undefined;
        parent.items.splice(index, 1);
        if (comment === undefined) return true;

        const next: unknown = parent.items[index];
        const nextNode: unknown = isPair(next) ? next.key : next;
        if (isNode(nextNode)) {
            nextNode.commentBefore =
                nextNode.commentBefore === undefined ? comment : `${comment}\n${nextNode.commentBefore}`;
            nextNode.spaceBefore = nextNode.spaceBefore || spaceBefore;
        } else {
            parent.comment = parent.comment === undefined ? comment : `${comment}\n${parent.comment}`;
        }
        return true;
    }

    public toString(): string {
        // Zero disables line folding: a long motd stays on one line, as it was written.
        return this.document.toString({ indent: INDENT, lineWidth: 0 });
    }

    /** Serialize YAML values as JSONC while carrying their comments to the corresponding values. */
    public toJsonc(): string {
        if (this.blank) {
            const comments = yamlCommentLines(this.document.commentBefore, 0);
            comments.push(...yamlCommentLines(this.document.comment ?? undefined, 0));
            comments.push('{}');
            return endsWithNewline(comments.join('\n'));
        }
        if (!isMap(this.document.contents)) throw new ConfigSyntaxError('yaml', 'the document root is not a map');

        try {
            const value: unknown = this.document.toJS();
            if (!isRecord(value)) throw new ConfigSyntaxError('yaml', 'the document root is not a map');

            const lines = yamlCommentLines(this.document.contents.commentBefore, 0);
            lines.push(...renderYamlMap(this.document.contents, value, 0));
            lines.push(...yamlCommentLines(this.document.comment ?? undefined, 0));
            return endsWithNewline(lines.join('\n'));
        } catch (error: unknown) {
            if (error instanceof ConfigSyntaxError) throw error;
            const detail = error instanceof Error ? error.message : String(error);
            throw new ConfigSyntaxError('yaml', `cannot convert to JSON: ${detail}`);
        }
    }
}

/**
 * The `jsonc-parser` scanner tokens the removal below looks at.
 *
 * Spelled out because the package declares `SyntaxKind` as a const enum, which TypeScript
 * cannot read from a declaration file under `isolatedModules`.
 */
const Token = { Comma: 5, LineComment: 12, LineBreak: 14, Whitespace: 15, EndOfFile: 17 } as const;

/** A list or a map the walk below can descend into. */
const isTree = (value: unknown): value is Record<string | number, unknown> =>
    typeof value === 'object' && value !== null;

/**
 * The indentation a JSON file already uses, read from its first indented line.
 *
 * `jsonc-parser` re-indents the region it edits from the tab size it is given, so a file
 * indented by two spaces edited at a tab size of four comes out flush left. Matching the
 * file keeps a new key in line with its neighbors.
 */
const detectIndentation = (text: string): { tabSize: number; insertSpaces: boolean } => {
    const match = text.match(/^([ \t]+)\S/m);
    if (match?.[1] === undefined) return { tabSize: INDENT, insertSpaces: true };
    const [, indentation] = match;
    return indentation.startsWith('\t')
        ? { tabSize: 1, insertSpaces: false }
        : { tabSize: indentation.length, insertSpaces: true };
};

/**
 * A JSON file that may carry `//` and `/* *\/` comments and trailing commas.
 *
 * Built on `jsonc-parser`, which edits the text rather than re-serializing a value, so the
 * bytes outside the changed path are untouched. The parser itself has no notion of writing
 * a comment, so a comment for a new key is spliced in above the inserted property here, and
 * a removal is cut out line by line so the neighbors keep their remarks.
 */
class JsonConfigDocument implements ConfigDocument {
    private text: string;

    public constructor(text: string) {
        const errors: ParseError[] = [];
        // A blank file is fine, and is what a fresh install has; the parser alone calls it an error.
        const tree = text.trim() === '' ? undefined : parseTree(text, errors, { allowTrailingComma: true });
        const [error] = errors;
        if (error) {
            throw new ConfigSyntaxError('json', `${printParseErrorCode(error.error)} at offset ${error.offset}`);
        }
        if (tree !== undefined && tree.type !== 'object' && tree.type !== 'array') {
            throw new ConfigSyntaxError('json', 'the document is a single value, not an object or an array');
        }

        this.text = text;
    }

    private get formattingOptions() {
        return { ...detectIndentation(this.text), eol: '\n' };
    }

    private node(path: ConfigPath): JsonNode | undefined {
        const tree = parseTree(this.text, undefined, { allowTrailingComma: true });
        return tree === undefined ? undefined : findNodeAtLocation(tree, [...path]);
    }

    public get(path: ConfigPath): unknown {
        if (this.text.trim() === '') return undefined;
        // `parse` builds ordinary objects; `getNodeValue` builds prototype-less ones, which
        // callers comparing against literals would trip over.
        let current: unknown = parse(this.text, undefined, { allowTrailingComma: true });
        for (const key of path) {
            if (!isTree(current) || !Object.hasOwn(current, key)) return undefined;
            current = current[key];
        }
        return current;
    }

    public has(path: ConfigPath): boolean {
        return this.node(path) !== undefined;
    }

    public set(path: ConfigPath, value: unknown, comment?: string): void {
        const existed = this.has(path);
        this.text = applyEdits(
            this.text,
            modify(this.text, [...path], value, { formattingOptions: this.formattingOptions })
        );
        if (existed || comment === undefined) return;

        const node = this.node(path);
        if (node === undefined) return;

        // A member's property node starts at its key; a list item starts at the value itself.
        const anchor = node.parent?.type === 'property' ? node.parent : node;
        const lineStart = this.text.lastIndexOf('\n', anchor.offset - 1) + 1;
        const indentation = this.text.slice(lineStart, anchor.offset);
        if (indentation.trim() !== '') return;

        const lines = comment.split('\n').map((line) => `// ${line}\n${indentation}`);
        this.text = this.text.slice(0, anchor.offset) + lines.join('') + this.text.slice(anchor.offset);
    }

    public delete(path: ConfigPath): boolean {
        const node = this.node(path);
        if (node === undefined) return false;
        if (path.length === 0) {
            this.text = '';
            return true;
        }

        const item = node.parent?.type === 'property' ? node.parent : node;
        const parent = item.parent;
        const siblings = parent?.children ?? [];
        const index = siblings.indexOf(item);
        const previous = siblings[index - 1];

        // `jsonc-parser`'s own removal cuts from the end of the previous item, taking that
        // item's trailing comment with it. Cutting the item's own lines instead, and the one
        // comma that joined it to a neighbor, leaves everything else where it was.
        const lineStart = this.text.lastIndexOf('\n', item.offset - 1) + 1;
        const ownsLine = this.text.slice(lineStart, item.offset).trim() === '';
        let start = ownsLine ? lineStart : item.offset;
        let end = item.offset + item.length;

        const comma = this.commaAfter(end);
        if (comma !== undefined) {
            end = comma + 1;
            if (ownsLine) end = this.endOfTrivia(end);
        } else if (previous !== undefined) {
            const joining = this.commaAfter(previous.offset + previous.length);
            if (joining !== undefined) {
                this.text = this.text.slice(0, joining) + this.text.slice(joining + 1);
                start -= 1;
                end -= 1;
            }
            if (ownsLine) end = this.endOfTrivia(end);
        } else if (ownsLine) {
            end = this.endOfTrivia(end);
        }

        this.text = this.text.slice(0, start) + this.text.slice(end);
        return true;
    }

    /** The offset of the comma that follows `offset` with only spaces and comments between, on the same line. */
    private commaAfter(offset: number): number | undefined {
        const scanner = createScanner(this.text.slice(offset), false);
        for (let kind: number = scanner.scan(); kind !== Token.EndOfFile; kind = scanner.scan()) {
            if (kind === Token.Comma) return offset + scanner.getTokenOffset();
            if (kind !== Token.Whitespace && kind !== Token.LineComment) return undefined;
        }
        return undefined;
    }

    /** The offset just past the rest of the line at `offset` when it holds only spaces and a comment. */
    private endOfTrivia(offset: number): number {
        const scanner = createScanner(this.text.slice(offset), false);
        for (let kind: number = scanner.scan(); kind !== Token.EndOfFile; kind = scanner.scan()) {
            if (kind === Token.LineBreak) return offset + scanner.getTokenOffset() + scanner.getTokenLength();
            if (kind !== Token.Whitespace && kind !== Token.LineComment) return offset;
        }
        return this.text.length;
    }

    public toString(): string {
        return endsWithNewline(this.text);
    }
}

/**
 * Parses config file content into an editable document.
 *
 * @param format - How `text` is written.
 * @param text - The file content; empty is allowed and reads as an empty map.
 * @throws ConfigSyntaxError when `text` is not valid in `format`, or is a single value.
 */
export const parseConfigDocument = (format: ConfigFormat, text: string): ConfigDocument => {
    switch (format) {
        case 'json':
            return new JsonConfigDocument(text);
        case 'yaml':
            return new YamlConfigDocument(text);
    }
};

/**
 * Converts a YAML config into an editable JSONC document, carrying comments to the matching
 * keys and values.
 *
 * @param text - The YAML source text.
 * @returns A JSONC document with the same values and preserved comments.
 * @throws ConfigSyntaxError when the YAML is invalid or its root is not a map.
 */
export const convertYamlToJsonConfigDocument = (text: string): ConfigDocument => {
    const yaml = new YamlConfigDocument(text);
    return new JsonConfigDocument(yaml.toJsonc());
};
