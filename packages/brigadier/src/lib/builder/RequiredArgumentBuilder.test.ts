import { assert, describe, beforeEach, it } from 'vitest';
import { instance, mock } from 'ts-mockito';
import type Command from '../Command';
import type RequiredArgumentBuilder from '../builder/RequiredArgumentBuilder';
import { argument } from '../builder/RequiredArgumentBuilder';
import type ArgumentType from '../arguments/ArgumentType';
import IntegerArgumentType from '../arguments/IntegerArgumentType';

describe('LiteralArgumentBuilderTest', () => {
    let builder: RequiredArgumentBuilder<Object, number>;
    const type: ArgumentType<number> = instance(mock(IntegerArgumentType));
    const command: Command<Object> = async () => 0;

    beforeEach(() => {
        builder = argument('foo', type) as any;
    });

    it('testBuild', () => {
        const node = builder.build();

        assert.equal(node.getName(), 'foo');
        assert.equal(node.getType(), type);
    });

    it('testBuildWithExecutor', () => {
        const node = builder.executes(command).build();

        assert.equal(node.getName(), 'foo');
        assert.equal(node.getType(), type);
        assert.equal(node.getCommand(), command);
    });

    it('testBuildWithChildren', () => {
        builder.then(argument('bar', type) as any);
        builder.then(argument('baz', type) as any);
        const node = builder.build();

        assert.equal(node.getChildrenCount(), 2);
    });
});
