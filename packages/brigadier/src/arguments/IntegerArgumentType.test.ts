import { assert, describe, expect, it } from 'vitest';
import StringReader from '../StringReader';
import { DefaultType } from '../arguments/ArgumentType';
import CommandSyntaxException from '../exceptions/CommandSyntaxException';

const { integer } = DefaultType;

describe('integerumentTypeTest', () => {
    it('parse', () => {
        const reader = new StringReader('15');
        assert.equal(integer().parse(reader), 15);
        assert.equal(reader.canRead(), false);
    });

    it('parse_tooSmall', async () => {
        const reader = new StringReader('-5');
        try {
            integer(0, 100).parse(reader);
        } catch (ex: any) {
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
        } catch (ex: any) {
            expect(ex.getType().toString()).to.equal(
                CommandSyntaxException.BUILT_IN_EXCEPTIONS.integerTooHigh().toString()
            );
            assert.equal(ex.getCursor(), 0);
            return;
        }

        assert.fail();
    });
});
