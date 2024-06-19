import { assert, describe, it } from 'vitest';
import { mock, instance, when, verify } from 'ts-mockito';
import { DefaultType } from '../arguments/ArgumentType';
import StringReader from '../StringReader';
import StringArgumentType from '../arguments/StringArgumentType';

const { word, string, greedyString } = DefaultType;
const { escapeIfRequired } = StringArgumentType;

describe('StringArgumentTypeTest', () => {
    it('testParseWord', () => {
        const mockedReader = mock(StringReader);
        when(mockedReader.readUnquotedString()).thenReturn('hello');
        const reader = instance(mockedReader);

        assert.equal(word().parse(reader), 'hello');

        verify(mockedReader.readUnquotedString()).called();
    });

    it('testParseString', () => {
        const mockedReader = mock(StringReader);
        when(mockedReader.readString()).thenReturn('hello world');
        const reader = instance(mockedReader);

        assert.equal(string().parse(reader), 'hello world');
        verify(mockedReader.readString()).called();
    });

    it('testParseGreedyString', () => {
        const reader = new StringReader('Hello world! This is a test.');
        assert.equal(greedyString().parse(reader), 'Hello world! This is a test.');
        assert.equal(reader.canRead(), false);
    });

    it('testToString', () => {
        assert.equal(string() + '', 'string()');
    });

    it('testEscapeIfRequired_notRequired', () => {
        assert.equal(escapeIfRequired('hello'), 'hello');
        assert.equal(escapeIfRequired(''), '');
    });

    it('testEscapeIfRequired_multipleWords', () => {
        assert.equal(escapeIfRequired('hello world'), '"hello world"');
    });

    it('testEscapeIfRequired_quote', () => {
        assert.equal(escapeIfRequired('hello "world"!'), '"hello \\"world\\"!"');
    });

    it('testEscapeIfRequired_escapes', () => {
        assert.equal(escapeIfRequired('\\'), '"\\\\"');
    });

    it('testEscapeIfRequired_singleQuote', () => {
        assert.equal(escapeIfRequired('"'), '"\\""');
    });
});
