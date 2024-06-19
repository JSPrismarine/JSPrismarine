import { assert, describe, it } from 'vitest';
import StringReader from '../StringReader';
import LiteralMessage from '../LiteralMessage';
import DynamicCommandExceptionType from '../exceptions/DynamicCommandExceptionType';

describe('DynamicCommandSyntaxExceptionTypeTest', () => {
    const type = new DynamicCommandExceptionType((name) => new LiteralMessage('Hello, ' + name + '!'));

    it('createWithContext', () => {
        const reader = new StringReader('Foo bar');
        reader.setCursor(5);
        const exception = type.createWithContext(reader, 'World');
        assert.deepEqual(exception.getType(), type);
        assert.equal(exception.getInput(), 'Foo bar');
        assert.equal(exception.getCursor(), 5);
    });
});
