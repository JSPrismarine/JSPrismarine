import type ImmutableStringReader from './ImmutableStringReader';
import CommandSyntaxException from './exceptions/CommandSyntaxException';

const SYNTAX_ESCAPE = '\\';
const SYNTAX_QUOTE = '"';

export default class StringReader implements ImmutableStringReader {
    private string: string;
    private cursor = 0;

    public constructor(other: string | StringReader) {
        if (typeof other === 'string') {
            this.string = other;
        } else {
            this.string = other.string;
            this.cursor = other.cursor;
        }
    }

    public getString(): string {
        return this.string;
    }

    public setCursor(cursor: number) {
        this.cursor = cursor;
    }

    public getRemainingLength(): number {
        return this.string.length - this.cursor;
    }

    public getTotalLength(): number {
        return this.string.length;
    }

    public getCursor(): number {
        return this.cursor;
    }

    public getRead(): string {
        return this.string.substring(0, this.cursor);
    }

    public getRemaining(): string {
        return this.string.substring(this.cursor);
    }

    public canRead(length = 1): boolean {
        return this.cursor + length <= this.string.length;
    }

    public peek(offset: number = 0): string {
        return this.string.charAt(this.cursor + offset);
    }

    public read(): string {
        return this.string.charAt(this.cursor++);
    }

    public skip(): void {
        this.cursor++;
    }

    public static isAllowedNumber(c: string): boolean {
        return (c >= '0' && c <= '9') || c == '.' || c == '-' || c == '+' || c == 'e' || c == 'E';
    }

    public skipWhitespace(): void {
        while (this.canRead() && /\s/.test(this.peek())) {
            this.skip();
        }
    }

    public readInt(): number {
        let start = this.cursor;
        while (this.canRead() && StringReader.isAllowedNumber(this.peek())) {
            this.skip();
        }

        let number = this.string.substring(start, this.cursor);
        if (number.length === 0) {
            throw CommandSyntaxException.BUILT_IN_EXCEPTIONS.readerExpectedInt().createWithContext(this);
        }

        const result = parseFloat(number);
        if (isNaN(result) || result !== Math.round(result)) {
            this.cursor = start;
            throw CommandSyntaxException.BUILT_IN_EXCEPTIONS.readerInvalidInt().createWithContext(this, number);
        } else return result;
    }

    public readFloat(): number {
        let start = this.cursor;
        while (this.canRead() && StringReader.isAllowedNumber(this.peek())) {
            this.skip();
        }

        let number = this.string.substring(start, this.cursor);
        if (number.length === 0) {
            throw CommandSyntaxException.BUILT_IN_EXCEPTIONS.readerExpectedFloat().createWithContext(this);
        }

        const result = parseFloat(number);
        if (isNaN(result) || result !== Number(number)) {
            this.cursor = start;
            throw CommandSyntaxException.BUILT_IN_EXCEPTIONS.readerInvalidFloat().createWithContext(this, number);
        } else return result;
    }

    public static isAllowedInUnquotedString(c: string): boolean {
        return (
            (c >= '0' && c <= '9') ||
            (c >= 'A' && c <= 'Z') ||
            (c >= 'a' && c <= 'z') ||
            c == '_' ||
            c == '-' ||
            c == '.' ||
            c == '+'
        );
    }

    public readUnquotedString(): string {
        let start = this.cursor;
        while (this.canRead() && StringReader.isAllowedInUnquotedString(this.peek())) {
            this.skip();
        }

        return this.string.substring(start, this.cursor);
    }

    public readQuotedString(): string {
        if (!this.canRead()) {
            return '';
        } else if (this.peek() != SYNTAX_QUOTE) {
            throw CommandSyntaxException.BUILT_IN_EXCEPTIONS.readerExpectedStartOfQuote().createWithContext(this);
        }

        this.skip();
        let result = '';
        let escaped = false;
        while (this.canRead()) {
            let c = this.read();
            if (escaped) {
                if (c == SYNTAX_QUOTE || c == SYNTAX_ESCAPE) {
                    result += c;
                    escaped = false;
                } else {
                    this.setCursor(this.getCursor() - 1);
                    throw CommandSyntaxException.BUILT_IN_EXCEPTIONS.readerInvalidEscape().createWithContext(this, c);
                }
            } else if (c == SYNTAX_ESCAPE) {
                escaped = true;
            } else if (c == SYNTAX_QUOTE) {
                return result;
            } else {
                result += c;
            }
        }

        throw CommandSyntaxException.BUILT_IN_EXCEPTIONS.readerExpectedEndOfQuote().createWithContext(this);
    }

    public readString(): string {
        if (this.canRead() && this.peek() === SYNTAX_QUOTE) {
            return this.readQuotedString();
        } else {
            return this.readUnquotedString();
        }
    }

    public readBoolean(): boolean {
        let start = this.cursor;
        let value = this.readString();
        if (value.length === 0) {
            throw CommandSyntaxException.BUILT_IN_EXCEPTIONS.readerExpectedBool().createWithContext(this);
        }

        if (value === 'true') {
            return true;
        } else if (value === 'false') {
            return false;
        } else {
            this.cursor = start;
            throw CommandSyntaxException.BUILT_IN_EXCEPTIONS.readerInvalidBool().createWithContext(this, value);
        }
    }

    public expect(c: string) {
        if (!this.canRead() || this.peek() !== c) {
            throw CommandSyntaxException.BUILT_IN_EXCEPTIONS.readerExpectedSymbol().createWithContext(this, c);
        }

        this.skip();
    }
}
