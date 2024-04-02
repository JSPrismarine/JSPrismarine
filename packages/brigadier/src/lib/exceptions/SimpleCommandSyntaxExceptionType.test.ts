import { assert, describe, it } from 'vitest';
import StringReader from '../StringReader';
import LiteralMessage from '../LiteralMessage';
import CommandSyntaxException from '../exceptions/CommandSyntaxException';
import SimpleCommandExceptionType from '../exceptions/SimpleCommandExceptionType';

describe('SimpleCommandSyntaxExceptionTypeTest', () => {
    it('createWithContext', () => {
        const type = new SimpleCommandExceptionType(new LiteralMessage('error'));
        const reader = new StringReader('Foo bar');
        reader.setCursor(5);
        const exception = type.createWithContext(reader);
        assert.deepEqual(exception.getType(), type);
        assert.equal(exception.getInput(), 'Foo bar');
        assert.equal(exception.getCursor(), 5);
    });

    it('getContext_none', () => {
        const exception = new CommandSyntaxException({}, new LiteralMessage('error'));
        assert.equal(exception.getContext(), null);
    });

    it('getContext_short', () => {
        const exception = new CommandSyntaxException({}, new LiteralMessage('error'), 'Hello world!', 5);
        assert.equal(exception.getContext(), 'Hello<--[HERE]');
    });

    it('getContext_long', () => {
        const exception = new CommandSyntaxException(
            {},
            new LiteralMessage('error'),
            'Hello world! This has an error in it. Oh dear!',
            20
        );
        assert.equal(exception.getContext(), '...d! This ha<--[HERE]');
    });
});
