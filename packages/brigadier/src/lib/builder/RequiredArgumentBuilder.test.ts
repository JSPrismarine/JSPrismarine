import { assert, expect, describe, beforeEach, it } from 'vitest';
import { instance, mock } from 'ts-mockito';
import Command from '../Command';
import RequiredArgumentBuilder, { argument } from '../builder/RequiredArgumentBuilder';
import ArgumentType from '../arguments/ArgumentType';
import IntegerArgumentType from '../arguments/IntegerArgumentType';

describe('LiteralArgumentBuilderTest', () => {
    let builder: RequiredArgumentBuilder<Object, number>;
    const type: ArgumentType<number> = instance(mock(IntegerArgumentType));
    const command: Command<Object> = async () => 0;

    beforeEach(() => {
        builder = argument('foo', type);
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
        builder.then(argument('bar', type));
        builder.then(argument('baz', type));
        const node = builder.build();

        assert.equal(node.getChildrenCount(), 2);
    });
});
