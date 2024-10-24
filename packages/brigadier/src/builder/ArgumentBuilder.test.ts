import { instance, mock } from 'ts-mockito';
import { assert, beforeEach, describe, expect, it } from 'vitest';
import { DefaultType } from '../arguments/ArgumentType';
import ArgumentBuilder from '../builder/ArgumentBuilder';
import { literal } from '../builder/LiteralArgumentBuilder';
import { argument } from '../builder/RequiredArgumentBuilder';
import CommandNode from '../tree/CommandNode';

const { integer } = DefaultType;

class TestableArgumentBuilder<S> extends ArgumentBuilder<S, TestableArgumentBuilder<S>> {
    public getThis(): TestableArgumentBuilder<S> {
        return this;
    }
    public build(): CommandNode<S> {
        return null as any; // FIXME
    }
}

describe('ArgumentBuilderTest', () => {
    let builder: TestableArgumentBuilder<Object>;

    beforeEach(() => {
        builder = new TestableArgumentBuilder();
    });

    it('testArguments', () => {
        const arg = argument('bar', integer());

        builder.then(arg as any); // FIXME

        assert.equal([...builder.getArguments()].length, 1);
        expect([...builder.getArguments()][0].equals(arg.build())).to.equal(true);
    });

    it('testRedirect', () => {
        const target = instance(mock(CommandNode));
        builder.redirect(target);
        assert.deepEqual(builder.getRedirect(), target);
    });

    it('testRedirect_withChild', () => {
        try {
            const target = instance(mock(CommandNode));
            builder.then(literal('foo'));
            builder.redirect(target);
            assert.fail();
        } catch {}
    });

    it('testThen_withRedirect', () => {
        try {
            const target = instance(mock(CommandNode));
            builder.redirect(target);
            builder.then(literal('foo'));
            assert.fail();
        } catch {}
    });
});
