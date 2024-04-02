import { assert, expect, describe, beforeEach, it } from 'vitest';
import Command from '../Command';
import LiteralArgumentBuilder from '../builder/LiteralArgumentBuilder';
import { argument } from '../builder/RequiredArgumentBuilder';
import { DefaultType } from '../arguments/ArgumentType';

const { integer } = DefaultType;

describe('LiteralArgumentBuilderTest', () => {
    let builder: LiteralArgumentBuilder<Object>;
    const command: Command<Object> = async () => 0;

    beforeEach(() => {
        builder = new LiteralArgumentBuilder('foo');
    });

    it('testBuild', () => {
        const node = builder.build();
        assert.equal(node.getLiteral(), 'foo');
    });

    it('testBuildWithExecutor', () => {
        const node = builder.executes(command).build();

        assert.equal(node.getLiteral(), 'foo');
        assert.equal(node.getCommand(), command);
    });

    it('testBuildWithChildren', () => {
        builder.then(argument('bar', integer()));
        builder.then(argument('baz', integer()));
        const node = builder.build();

        assert.equal(node.getChildrenCount(), 2);
    });
});
