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
 * Raised when a config file cannot be read as JSON.
 *
 * Thrown rather than swallowed on purpose. Treating a file with a typo in it as empty and then
 * writing the defaults back is how a server used to erase its own config; refusing to start
 * keeps the file for the person to fix.
 */
export class ConfigSyntaxError extends Error {
    public constructor(detail: string) {
        super(`Not valid json: ${detail}`);
        this.name = 'ConfigSyntaxError';
    }
}

const endsWithNewline = (text: string): string => (text === '' || text.endsWith('\n') ? text : `${text}\n`);

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

/** The order new keys follow when the document was opened without one: `$schema` first. */
const DEFAULT_KEY_ORDER: readonly string[] = ['$schema'];

/**
 * Where among `properties` a new `key` is inserted so the file follows `order`.
 *
 * A key the order does not name ranks after every named one, so whatever a person added by
 * hand stays below the keys the server owns; among themselves, unnamed keys append in write
 * order. Existing keys are never moved - this only decides where a new one lands.
 */
const insertionIndex = (properties: readonly string[], key: string, order: readonly string[]): number => {
    const rank = (name: string): number => {
        const index = order.indexOf(name);
        return index === -1 ? order.length : index;
    };
    const target = rank(key);
    const index = properties.findIndex((property) => rank(property) > target);
    return index === -1 ? properties.length : index;
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
    private readonly keyOrder: readonly string[];

    public constructor(text: string, keyOrder: readonly string[] = DEFAULT_KEY_ORDER) {
        const errors: ParseError[] = [];
        // A blank file is fine, and is what a fresh install has; the parser alone calls it an error.
        const tree = text.trim() === '' ? undefined : parseTree(text, errors, { allowTrailingComma: true });
        const [error] = errors;
        if (error) {
            throw new ConfigSyntaxError(`${printParseErrorCode(error.error)} at offset ${error.offset}`);
        }
        if (tree !== undefined && tree.type !== 'object' && tree.type !== 'array') {
            throw new ConfigSyntaxError('the document is a single value, not an object or an array');
        }

        this.text = text;
        this.keyOrder = keyOrder;
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
        // Only a new top-level key takes a decided position; deeper keys and existing keys
        // stay where the file has them. A key that ranks last appends, like any other edit.
        const [top] = path;
        const inserted = !existed && path.length === 1 && typeof top === 'string' && this.insertOrdered(top, value);
        if (!inserted) {
            this.text = applyEdits(
                this.text,
                modify(this.text, [...path], value, { formattingOptions: this.formattingOptions })
            );
        }
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

    /**
     * Writes a new top-level `key` above the first existing key the order ranks after it.
     *
     * Spliced into the text by hand rather than through `modify`'s insertion index, because
     * `jsonc-parser` anchors a mid-object insertion right after the previous value, which
     * puts the new property in front of that value's trailing comment and carries the
     * comment off onto the new line.
     *
     * @returns Whether the splice happened; `false` leaves the caller to append normally.
     */
    private insertOrdered(key: string, value: unknown): boolean {
        const tree = parseTree(this.text, undefined, { allowTrailingComma: true });
        if (tree === undefined || tree.type !== 'object') return false;

        const members = tree.children ?? [];
        const names = members.map((member) => {
            const name: unknown = member.children?.[0]?.value;
            return typeof name === 'string' ? name : '';
        });
        const successor = members[insertionIndex(names, key, this.keyOrder)];
        if (successor === undefined) return false;

        // The line the successor starts on, provided it owns the line.
        const successorLineStart = this.text.lastIndexOf('\n', successor.offset - 1) + 1;
        const indentation = this.text.slice(successorLineStart, successor.offset);
        if (indentation.trim() !== '') return false;

        // Comment lines directly above belong to the successor; the new key goes above them.
        let lineStart = successorLineStart;
        for (;;) {
            const previousLineStart = this.text.lastIndexOf('\n', lineStart - 2) + 1;
            if (previousLineStart >= lineStart) break;
            const line = this.text.slice(previousLineStart, lineStart).trim();
            if (!line.startsWith('//') && !(line.startsWith('/*') && line.endsWith('*/'))) break;
            lineStart = previousLineStart;
        }

        const { tabSize, insertSpaces } = this.formattingOptions;
        const unit = insertSpaces ? ' '.repeat(tabSize) : '\t';
        const serialized = JSON.stringify(value, null, unit) ?? 'null';
        const lines = serialized.split('\n').map((line, index) => (index === 0 ? line : `${indentation}${line}`));
        this.text =
            this.text.slice(0, lineStart) +
            `${indentation}${JSON.stringify(key)}: ${lines.join('\n')},\n` +
            this.text.slice(lineStart);
        return true;
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
 * @param text - The file content; empty is allowed and reads as an empty map.
 * @param keyOrder - Where new top-level keys are inserted; `$schema` first when omitted.
 * @throws ConfigSyntaxError when `text` is not valid JSON, or is a single value.
 */
export const parseConfigDocument = (text: string, keyOrder?: readonly string[]): ConfigDocument =>
    new JsonConfigDocument(text, keyOrder);
