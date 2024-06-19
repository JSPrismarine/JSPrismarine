import { assert, describe, expect, it } from 'vitest';
import StringReader from '../StringReader';
import { DefaultType } from '../arguments/ArgumentType';
import CommandSyntaxException from '../exceptions/CommandSyntaxException';

const { float } = DefaultType;

describe('floatumentTypeTest', () => {
    it('parse', () => {
        const reader = new StringReader('15');
        assert.equal(float().parse(reader), 15);
        assert.equal(reader.canRead(), false);
    });

    it('parse_tooSmall', async () => {
        const reader = new StringReader('-5');
        try {
            float(0, 100).parse(reader);
        } catch (ex: any) {
            expect(ex.getType().toString()).to.equal(
                CommandSyntaxException.BUILT_IN_EXCEPTIONS.floatTooLow().toString()
            );
            assert.equal(ex.getCursor(), 0);
            return;
        }
        assert.fail();
    });

    it('parse_tooBig', async () => {
        const reader = new StringReader('5');
        try {
            float(-100, 0).parse(reader);
        } catch (ex: any) {
            expect(ex.getType().toString()).to.equal(
                CommandSyntaxException.BUILT_IN_EXCEPTIONS.floatTooHigh().toString()
            );
            assert.equal(ex.getCursor(), 0);
            return;
        }
        assert.fail();
    });

    it.todo('testEquals', () => {
        /*testEquality(float(), float());
        testEquality(float(-100, 100), float(-100, 100));
        testEquality(float(-100, 50), float(-100, 50));
        testEquality(float(-50, 100), float(-50, 100));*/
    });

    it.todo('testToString', () => {
        /*assert.equal(float() + '', 'float()');
        assert.equal(float(-100) + '', 'float(-100)');
        assert.equal(float(-100, 100) + '', 'float(-100, 100)');
        assert.equal(float(Number.MIN_SAFE_INTEGER, 100) + '', 'float(-9007199254740991, 100)');*/
    });
});
