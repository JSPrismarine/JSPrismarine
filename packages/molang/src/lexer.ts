/** Keywords the parser treats specially. Everything else that looks like a word is an identifier. */
export const KEYWORDS = ['return', 'loop', 'for_each', 'break', 'continue', 'this', 'true', 'false'] as const;

/** One of `KEYWORDS`. */
export type Keyword = (typeof KEYWORDS)[number];

/** The lexical category of a token. */
export type TokenKind = 'number' | 'string' | 'identifier' | 'keyword' | 'operator';

/** A lexed token. `value` is lowercased except for string contents, which keep their case. */
export interface Token {
    kind: TokenKind;
    value: string;
    /** Offset of the token's first character in the source text. */
    start: number;
}

/** Raised when the source text cannot be tokenized or parsed. */
export class MolangSyntaxError extends Error {
    public constructor(
        message: string,
        /** Offset in the source text where the error was found. */
        public readonly offset: number
    ) {
        super(`${message} at offset ${offset}`);
        this.name = 'MolangSyntaxError';
    }
}

const TWO_CHAR_OPERATORS = ['&&', '||', '==', '!=', '<=', '>=', '??', '->'] as const;
const ONE_CHAR_OPERATORS = '!<>=+-*/()[]{};:,?.';

const isDigit = (char: string) => char >= '0' && char <= '9';
const isWordStart = (char: string) => (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_';
const isWordPart = (char: string) => isWordStart(char) || isDigit(char) || char === '.';

/**
 * Splits Molang source text into tokens. Molang is case-insensitive except inside strings, so
 * identifiers and keywords are lowercased here and string contents are preserved.
 *
 * @throws {MolangSyntaxError} When the text contains an unexpected character or an unterminated string.
 */
export function tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    let index = 0;
    while (index < source.length) {
        const char = source[index]!;
        if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
            index++;
            continue;
        }
        const start = index;
        if (isDigit(char) || (char === '.' && isDigit(source[index + 1] ?? ''))) {
            while (index < source.length && (isDigit(source[index]!) || source[index] === '.')) index++;
            // A trailing `f` marks a float literal, as in `0.5f`.
            if (source[index] === 'f' || source[index] === 'F') index++;
            const text = source.slice(start, index);
            tokens.push({
                kind: 'number',
                value: text.endsWith('f') || text.endsWith('F') ? text.slice(0, -1) : text,
                start
            });
            continue;
        }
        if (char === "'") {
            const end = source.indexOf("'", index + 1);
            if (end < 0) throw new MolangSyntaxError('unterminated string', start);
            tokens.push({ kind: 'string', value: source.slice(index + 1, end), start });
            index = end + 1;
            continue;
        }
        if (isWordStart(char)) {
            while (index < source.length && isWordPart(source[index]!)) index++;
            const word = source.slice(start, index).toLowerCase();
            tokens.push({
                kind: (KEYWORDS as readonly string[]).includes(word) ? 'keyword' : 'identifier',
                value: word,
                start
            });
            continue;
        }
        const pair = source.slice(index, index + 2);
        if ((TWO_CHAR_OPERATORS as readonly string[]).includes(pair)) {
            tokens.push({ kind: 'operator', value: pair, start });
            index += 2;
            continue;
        }
        if (ONE_CHAR_OPERATORS.includes(char)) {
            tokens.push({ kind: 'operator', value: char, start });
            index++;
            continue;
        }
        throw new MolangSyntaxError(`unexpected character ${JSON.stringify(char)}`, start);
    }
    return tokens;
}
