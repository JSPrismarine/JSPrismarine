import { assert, expect, describe, beforeEach, it } from 'vitest';
import testEquality from '../util/isEqual.test';
import CommandSyntaxException from '../exceptions/CommandSyntaxException';
import { DefaultType } from '../arguments/ArgumentType';
import StringReader from '../StringReader';

const { integer } = DefaultType;

describe('integerumentTypeTest', () => {
    let type;

    beforeEach(() => {
        type = integer(-100, 100);
    });

    it('parse', () => {
        const reader = new StringReader('15');
        assert.equal(integer().parse(reader), 15);
        assert.equal(reader.canRead(), false);
    });

    it('parse_tooSmall', async () => {
        const reader = new StringReader('-5');
        try {
            integer(0, 100).parse(reader);
        } catch (ex) {
            expect(ex.getType().toString()).to.equal(
                CommandSyntaxException.BUILT_IN_EXCEPTIONS.integerTooLow().toString()
            );
            assert.equal(ex.getCursor(), 0);
            return;
        }

        assert.fail();
    });

    it('parse_tooBig', async () => {
        const reader = new StringReader('5');
        try {
            integer(-100, 0).parse(reader);
        } catch (ex) {
            expect(ex.getType().toString()).to.equal(
                CommandSyntaxException.BUILT_IN_EXCEPTIONS.integerTooHigh().toString()
            );
            assert.equal(ex.getCursor(), 0);
            return;
        }

        assert.fail();
    });

    it('testEquals', () => {
        testEquality(integer(), integer());
        testEquality(integer(-100, 100), integer(-100, 100));
        testEquality(integer(-100, 50), integer(-100, 50));
        testEquality(integer(-50, 100), integer(-50, 100));
    });

    it('testToString', () => {
        assert.equal(integer() + '', 'integer()');
        assert.equal(integer(-100) + '', 'integer(-100)');
        assert.equal(integer(-100, 100) + '', 'integer(-100, 100)');
        assert.equal(integer(Number.MIN_SAFE_INTEGER, 100) + '', 'integer(-9007199254740991, 100)');
    });
});
