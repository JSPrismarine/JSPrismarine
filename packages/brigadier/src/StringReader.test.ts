import { assert, describe, it } from 'vitest';
import StringReader from './StringReader';
import CommandSyntaxException from './exceptions/CommandSyntaxException';

describe('StringReader Test', () => {
    it('canRead', () => {
        const reader = new StringReader('abc');
        assert.equal(reader.canRead(), true);
        reader.skip();
        assert.equal(reader.canRead(), true);
        reader.skip();
        assert.equal(reader.canRead(), true);
        reader.skip();
        assert.equal(reader.canRead(), false);

        const reader1 = new StringReader('abc');
        assert.equal(reader1.getRemainingLength(), 3);
        reader1.setCursor(1);
        assert.equal(reader1.getRemainingLength(), 2);
        reader1.setCursor(2);
        assert.equal(reader1.getRemainingLength(), 1);
        reader1.setCursor(3);
        assert.equal(reader1.getRemainingLength(), 0);
    });

    it('getRemainingLength', () => {
        const reader = new StringReader('abc');
        assert.equal(reader.getRemainingLength(), 3);
        reader.setCursor(1);
        assert.equal(reader.getRemainingLength(), 2);
        reader.setCursor(2);
        assert.equal(reader.getRemainingLength(), 1);
        reader.setCursor(3);
        assert.equal(reader.getRemainingLength(), 0);
    });

    it('peek', () => {
        const reader = new StringReader('abc');
        assert.equal(reader.peek(), 'a');
        assert.equal(reader.getCursor(), 0);
        reader.setCursor(2);
        assert.equal(reader.peek(), 'c');
        assert.equal(reader.getCursor(), 2);

        const reader1 = new StringReader('abc');
        assert.equal(reader1.peek(0), 'a');
        assert.equal(reader1.peek(2), 'c');
        assert.equal(reader1.getCursor(), 0);
        reader1.setCursor(1);
        assert.equal(reader1.peek(1), 'c');
        assert.equal(reader1.getCursor(), 1);
    });

    it('read', () => {
        const reader = new StringReader('abc');
        assert.equal(reader.read(), 'a');
        assert.equal(reader.read(), 'b');
        assert.equal(reader.read(), 'c');
        assert.equal(reader.getCursor(), 3);
    });

    it('skip', () => {
        const reader = new StringReader('abc');
        reader.skip();
        assert.equal(reader.getCursor(), 1);
    });

    it('getRemaining', () => {
        const reader = new StringReader('Hello!');
        assert.equal(reader.getRemaining(), 'Hello!');
        reader.setCursor(3);
        assert.equal(reader.getRemaining(), 'lo!');
        reader.setCursor(6);
        assert.equal(reader.getRemaining(), '');
    });

    it('getRead', () => {
        const reader = new StringReader('Hello!');
        assert.equal(reader.getRead(), '');
        reader.setCursor(3);
        assert.equal(reader.getRead(), 'Hel');
        reader.setCursor(6);
        assert.equal(reader.getRead(), 'Hello!');
    });

    it('skipWhitespace_none', () => {
        const reader = new StringReader('Hello!');
        reader.skipWhitespace();
        assert.equal(reader.getCursor(), 0);
    });

    it('skipWhitespace_mixed', () => {
        const reader = new StringReader(' \t \t\nHello!');
        reader.skipWhitespace();
        assert.equal(reader.getCursor(), 5);
    });

    it('skipWhitespace_empty', () => {
        const reader = new StringReader('');
        reader.skipWhitespace();
        assert.equal(reader.getCursor(), 0);
    });

    it('readUnquotedString', () => {
        const reader = new StringReader('hello world');
        assert.equal(reader.readUnquotedString(), 'hello');
        assert.equal(reader.getRead(), 'hello');
        assert.equal(reader.getRemaining(), ' world');
    });

    it('readUnquotedString_empty', () => {
        const reader = new StringReader('');
        assert.equal(reader.readUnquotedString(), '');
        assert.equal(reader.getRead(), '');
        assert.equal(reader.getRemaining(), '');
    });

    it('readUnquotedString_empty_withRemaining', () => {
        const reader = new StringReader(' hello world');
        assert.equal(reader.readUnquotedString(), '');
        assert.equal(reader.getRead(), '');
        assert.equal(reader.getRemaining(), ' hello world');
    });

    it('readSingleQuotedString', () => {
        const reader = new StringReader("'hello world'");
        assert.equal(reader.readQuotedString(), 'hello world');
        assert.equal(reader.getRead(), "'hello world'");
        assert.equal(reader.getRemaining(), '');
    });

    it('readDoubleQuotedString', () => {
        const reader = new StringReader('"hello world"');
        assert.equal(reader.readQuotedString(), 'hello world');
        assert.equal(reader.getRead(), '"hello world"');
        assert.equal(reader.getRemaining(), '');
    });

    it('readQuotedString_empty', () => {
        const reader = new StringReader('');
        assert.equal(reader.readQuotedString(), '');
        assert.equal(reader.getRead(), '');
        assert.equal(reader.getRemaining(), '');
    });

    it('readQuotedString_emptyQuoted', () => {
        const reader = new StringReader('""');
        assert.equal(reader.readQuotedString(), '');
        assert.equal(reader.getRead(), '""');
        assert.equal(reader.getRemaining(), '');
    });

    it('readQuotedString_emptyQuoted_withRemaining', () => {
        const reader = new StringReader('"" hello world');
        assert.equal(reader.readQuotedString(), '');
        assert.equal(reader.getRead(), '""');
        assert.equal(reader.getRemaining(), ' hello world');
    });

    it('readQuotedString_withEscapedQuote', () => {
        const reader = new StringReader('"hello \\"world\\""');
        assert.equal(reader.readQuotedString(), 'hello "world"');
        assert.equal(reader.getRead(), '"hello \\"world\\""');
        assert.equal(reader.getRemaining(), '');
    });

    it('readQuotedString_withEscapedEscapes', () => {
        const reader = new StringReader('"\\\\o/"');
        assert.equal(reader.readQuotedString(), '\\o/');
        assert.equal(reader.getRead(), '"\\\\o/"');
        assert.equal(reader.getRemaining(), '');
    });

    it('readQuotedString_withRemaining', () => {
        const reader = new StringReader('"hello world" foo bar');
        assert.equal(reader.readQuotedString(), 'hello world');
        assert.equal(reader.getRead(), '"hello world"');
        assert.equal(reader.getRemaining(), ' foo bar');
    });

    it('readQuotedString_withImmediateRemaining', () => {
        const reader = new StringReader('"hello world"foo bar');
        assert.equal(reader.readQuotedString(), 'hello world');
        assert.equal(reader.getRead(), '"hello world"');
        assert.equal(reader.getRemaining(), 'foo bar');
    });

    it('readQuotedString_noOpen', () => {
        try {
            new StringReader('hello world"').readQuotedString();
            assert.fail();
        } catch (ex: any) {
            assert.equal(ex.getType(), CommandSyntaxException.BUILT_IN_EXCEPTIONS.readerExpectedStartOfQuote());
            assert.equal(ex.getCursor(), 0);
        }
    });

    it('readQuotedString_noClose', () => {
        try {
            new StringReader('"hello world').readQuotedString();
            assert.fail();
        } catch (ex: any) {
            assert.equal(ex.getType(), CommandSyntaxException.BUILT_IN_EXCEPTIONS.readerExpectedEndOfQuote());
            assert.equal(ex.getCursor(), 12);
        }
    });

    it('readQuotedString_invalidEscape', () => {
        try {
            new StringReader('"hello\\nworld"').readQuotedString();
            assert.fail();
        } catch (ex: any) {
            assert.equal(ex.getType(), CommandSyntaxException.BUILT_IN_EXCEPTIONS.readerInvalidEscape());
            assert.equal(ex.getCursor(), 7);
        }
    });

    it('readInt', () => {
        const reader = new StringReader('1234567890');
        assert.equal(reader.readInt(), 1234567890);
        assert.equal(reader.getRead(), '1234567890');
        assert.equal(reader.getRemaining(), '');
    });

    it('readInt_negative', () => {
        const reader = new StringReader('-1234567890');
        assert.equal(reader.readInt(), -1234567890);
        assert.equal(reader.getRead(), '-1234567890');
        assert.equal(reader.getRemaining(), '');
    });

    it('readInt_invalid', () => {
        try {
            new StringReader('12.34').readInt();
            assert.fail();
        } catch (ex: any) {
            assert.deepEqual(ex.getType(), CommandSyntaxException.BUILT_IN_EXCEPTIONS.readerInvalidInt());
            assert.equal(ex.getCursor(), 0);
        }
    });

    it('readInt_none', () => {
        try {
            new StringReader('').readInt();
            assert.fail();
        } catch (ex: any) {
            assert.deepEqual(ex.getType(), CommandSyntaxException.BUILT_IN_EXCEPTIONS.readerExpectedInt());
            assert.equal(ex.getCursor(), 0);
        }
    });

    it('readInt_withRemaining', () => {
        const reader = new StringReader('+1234567890 foo bar');
        assert.equal(reader.readInt(), 1234567890);
        assert.equal(reader.getRead(), '+1234567890');
        assert.equal(reader.getRemaining(), ' foo bar');
    });

    it('readInt_withRemainingImmediate', () => {
        const reader = new StringReader('1234567890foo bar');
        assert.equal(reader.readInt(), 1234567890);
        assert.equal(reader.getRead(), '1234567890');
        assert.equal(reader.getRemaining(), 'foo bar');
    });

    it('readInt_exponent', () => {
        const reader = new StringReader('12e3');
        assert.equal(reader.readInt(), 12000);
        assert.equal(reader.getRead(), '12e3');
        assert.equal(reader.getRemaining(), '');
    });

    it('readFloat', () => {
        const reader = new StringReader('123');
        assert.equal(reader.readFloat(), 123.0);
        assert.equal(reader.getRead(), '123');
        assert.equal(reader.getRemaining(), '');
    });

    it('readFloat_withDecimal', () => {
        const reader = new StringReader('12.34');
        assert.equal(reader.readFloat(), 12.34);
        assert.equal(reader.getRead(), '12.34');
        assert.equal(reader.getRemaining(), '');
    });

    it('readFloat_negative', () => {
        const reader = new StringReader('-123');
        assert.equal(reader.readFloat(), -123.0);
        assert.equal(reader.getRead(), '-123');
        assert.equal(reader.getRemaining(), '');
    });

    it('readFloat_invalid', () => {
        try {
            new StringReader('12.34.56').readFloat();
            assert.fail();
        } catch (ex: any) {
            assert.equal(ex.getType(), CommandSyntaxException.BUILT_IN_EXCEPTIONS.readerInvalidFloat());
            assert.equal(ex.getCursor(), 0);
        }
    });

    it('readFloat_none', () => {
        try {
            new StringReader('').readFloat();
            assert.fail();
        } catch (ex: any) {
            assert.equal(ex.getType(), CommandSyntaxException.BUILT_IN_EXCEPTIONS.readerExpectedFloat());
            assert.equal(ex.getCursor(), 0);
        }
    });

    it('readFloat_withRemaining', () => {
        const reader = new StringReader('12.34 foo bar');
        assert.equal(reader.readFloat(), 12.34);
        assert.equal(reader.getRead(), '12.34');
        assert.equal(reader.getRemaining(), ' foo bar');
    });

    it('readFloat_withRemainingImmediate', () => {
        const reader = new StringReader('12.34foo bar');
        assert.equal(reader.readFloat(), 12.34);
        assert.equal(reader.getRead(), '12.34');
        assert.equal(reader.getRemaining(), 'foo bar');
    });

    it('readFloat_exponent', () => {
        const reader = new StringReader('1.23E4');
        assert.equal(reader.readFloat(), 12300.0);
        assert.equal(reader.getRead(), '1.23E4');
        assert.equal(reader.getRemaining(), '');
    });

    it('readFloat_negativeExponent', () => {
        const reader = new StringReader('1.23E-4');
        assert.equal(reader.readFloat(), 0.000123);
        assert.equal(reader.getRead(), '1.23E-4');
        assert.equal(reader.getRemaining(), '');
    });

    it('expect_correct', () => {
        const reader = new StringReader('abc');
        reader.expect('a');
        assert.equal(reader.getCursor(), 1);
    });

    it('expect_incorrect', () => {
        const reader = new StringReader('bcd');
        try {
            reader.expect('a');
            assert.fail();
        } catch (ex: any) {
            assert.equal(ex.getType(), CommandSyntaxException.BUILT_IN_EXCEPTIONS.readerExpectedSymbol());
            assert.equal(ex.getCursor(), 0);
        }
    });

    it('expect_none', () => {
        const reader = new StringReader('');
        try {
            reader.expect('a');
            assert.fail();
        } catch (ex: any) {
            assert.equal(ex.getType(), CommandSyntaxException.BUILT_IN_EXCEPTIONS.readerExpectedSymbol());
            assert.equal(ex.getCursor(), 0);
        }
    });

    it('readBoolean_correct', () => {
        const reader = new StringReader('true');
        assert.equal(reader.readBoolean(), true);
        assert.equal(reader.getRead(), 'true');
    });

    it('readBoolean_incorrect', () => {
        const reader = new StringReader('tuesday');
        try {
            reader.readBoolean();
            assert.fail();
        } catch (ex: any) {
            assert.equal(ex.getType(), CommandSyntaxException.BUILT_IN_EXCEPTIONS.readerInvalidBool());
            assert.equal(ex.getCursor(), 0);
        }
    });

    it('readBoolean_none', () => {
        const reader = new StringReader('');
        try {
            reader.readBoolean();
            assert.fail();
        } catch (ex: any) {
            assert.equal(ex.getType(), CommandSyntaxException.BUILT_IN_EXCEPTIONS.readerExpectedBool());
            assert.equal(ex.getCursor(), 0);
        }
    });
});
