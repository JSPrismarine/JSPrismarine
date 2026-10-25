/**
 * The argument compound of `/function <name> <arguments>`, read as SNBT.
 *
 * `@jsprismarine/mcfunction` reads a macro's argument compound as JSON by
 * default and says so: SNBT needs a parser the package does not own, and it
 * takes one through its `parseArguments` seam instead. This is that parser,
 * and it is deliberately only as big as the seam needs.
 *
 * What SNBT adds over JSON, all of which a datapack author writes by habit:
 * unquoted keys and unquoted bare values, single-quoted strings, and the type
 * suffixes `b`, `s`, `l`, `f` and `d` on a number. What it does not add here
 * is typed arrays (`[I; 1, 2]`): the macro grammar renders a list back out as
 * SNBT text, and a plain list is the only list shape a macro argument is ever
 * read as.
 *
 * A number keeps its numeric form so the macro substitution prints it without
 * its suffix, which is the 1.20.2 fix; `1b` therefore reaches a command as
 * `1` rather than as `1b`. `true` and `false` stay booleans, which Java also
 * substitutes as `true` and `false` rather than as `1b` and `0b`.
 */

/** Why a compound did not read. The offset is into the text that was handed in. */
export class SnbtSyntaxError extends Error {
    public override name = 'SnbtSyntaxError';

    public constructor(
        message: string,
        /** How far into the input the parse stopped. */
        public readonly offset: number
    ) {
        super(message);
    }
}

/** The suffixes a number may carry, which say its NBT type and nothing else here. */
const NUMBER_SUFFIXES = 'bBsSlLfFdD';

/** A bare, unquoted word: what an unquoted key and an unquoted value are made of. */
const BARE_PATTERN = /^[A-Za-z0-9_+.-]+$/;

/** One pass over the text, carrying the cursor the whole parse shares. */
class Reader {
    public offset = 0;

    public constructor(private readonly text: string) {}

    public get atEnd(): boolean {
        return this.offset >= this.text.length;
    }

    public peek(): string {
        return this.text[this.offset] ?? '';
    }

    public skipWhitespace(): void {
        while (!this.atEnd && /\s/.test(this.peek())) this.offset += 1;
    }

    public expect(character: string): void {
        this.skipWhitespace();
        if (this.peek() !== character) this.fail(`expected '${character}'`);
        this.offset += 1;
    }

    public fail(message: string): never {
        throw new SnbtSyntaxError(message, this.offset);
    }

    /** Reads a quoted string, honoring `\\` and the escape of its own quote. */
    public readQuoted(quote: string): string {
        this.offset += 1;
        let value = '';
        while (!this.atEnd) {
            const character = this.peek();
            this.offset += 1;
            if (character === '\\') {
                if (this.atEnd) this.fail('the string ends in a backslash');
                value += this.peek();
                this.offset += 1;
                continue;
            }
            if (character === quote) return value;
            value += character;
        }
        this.fail('unterminated string');
    }

    /** Reads an unquoted run of bare characters. */
    public readBare(): string {
        const start = this.offset;
        while (!this.atEnd && BARE_PATTERN.test(this.peek())) this.offset += 1;
        if (this.offset === start) this.fail('expected a value');
        return this.text.slice(start, this.offset);
    }
}

/**
 * Reads a bare word as the value it spells: a boolean, a number with or
 * without its type suffix, or, failing both, the word itself as a string,
 * which is how SNBT spells an unquoted string.
 */
const valueOfBareWord = (word: string): unknown => {
    if (word === 'true') return true;
    if (word === 'false') return false;

    const suffix = word.at(-1) ?? '';
    const body = NUMBER_SUFFIXES.includes(suffix) ? word.slice(0, -1) : word;
    // `+` and `.` are bare characters, so `.` alone and `+` alone reach here
    // and must not read as numbers.
    if (body.length > 0 && /^[+-]?(\d+\.?\d*|\.\d+)$/.test(body)) {
        const parsed = Number(body);
        if (Number.isFinite(parsed)) return parsed;
    }
    return word;
};

const readValue = (reader: Reader): unknown => {
    reader.skipWhitespace();
    const character = reader.peek();
    if (character === '"' || character === "'") return reader.readQuoted(character);
    if (character === '{') return readCompound(reader);
    if (character === '[') return readList(reader);
    return valueOfBareWord(reader.readBare());
};

const readList = (reader: Reader): unknown[] => {
    reader.expect('[');
    const values: unknown[] = [];

    reader.skipWhitespace();
    if (reader.peek() === ']') {
        reader.offset += 1;
        return values;
    }

    for (;;) {
        values.push(readValue(reader));
        reader.skipWhitespace();
        if (reader.peek() === ',') {
            reader.offset += 1;
            continue;
        }
        reader.expect(']');
        return values;
    }
};

const readCompound = (reader: Reader): Record<string, unknown> => {
    reader.expect('{');
    const compound: Record<string, unknown> = {};

    reader.skipWhitespace();
    if (reader.peek() === '}') {
        reader.offset += 1;
        return compound;
    }

    for (;;) {
        reader.skipWhitespace();
        const quote = reader.peek();
        const key = quote === '"' || quote === "'" ? reader.readQuoted(quote) : reader.readBare();
        reader.expect(':');
        compound[key] = readValue(reader);

        reader.skipWhitespace();
        if (reader.peek() === ',') {
            reader.offset += 1;
            continue;
        }
        reader.expect('}');
        return compound;
    }
};

/**
 * Reads one SNBT compound.
 *
 * @param text - The compound source, braces included.
 * @returns The compound as a plain object, suitable as a macro's arguments.
 * @throws {SnbtSyntaxError} When the text is not one compound, or carries
 *   anything past its closing brace.
 */
export const parseSnbtCompound = (text: string): Record<string, unknown> => {
    const reader = new Reader(text);
    const compound = readCompound(reader);

    reader.skipWhitespace();
    if (!reader.atEnd) reader.fail('there is text after the compound');
    return compound;
};

/**
 * The same, reported rather than thrown, which is the shape
 * `FunctionExecutor` takes its `parseArguments` in.
 *
 * @returns The compound, or undefined when the text does not read as one.
 */
export const readMacroArguments = (text: string): Record<string, unknown> | undefined => {
    try {
        return parseSnbtCompound(text);
    } catch {
        return undefined;
    }
};
