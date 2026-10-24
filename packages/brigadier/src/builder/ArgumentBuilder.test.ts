import { instance, mock } from 'ts-mockito';
import { assert, beforeEach, describe, expect, it } from 'vitest';
import { DefaultType } from '../arguments/ArgumentType';
import ArgumentBuilder from '../builder/ArgumentBuilder';
import { literal } from '../builder/LiteralArgumentBuilder';
import { argument } from '../builder/RequiredArgumentBuilder';
import CommandNode from '../tree/CommandNode';
import CommandDispatcher from '../CommandDispatcher';
import CommandContextBuilder from '../context/CommandContextBuilder';
import type SingleRedirectModifier from '../SingleRedirectModifier';

const { integer } = DefaultType;

class TestableArgumentBuilder<S> extends ArgumentBuilder<S, TestableArgumentBuilder<S>> {
    public getThis(): TestableArgumentBuilder<S> {
        return this;
    }
    public build(): CommandNode<S> {
        throw new Error('not built in these tests');
    }
}

describe('ArgumentBuilderTest', () => {
    let builder: TestableArgumentBuilder<Object>;

    beforeEach(() => {
        builder = new TestableArgumentBuilder();
    });

    it('testArguments', () => {
        const arg = argument<Object, number>('bar', integer());

        builder.then(arg);

        assert.equal([...builder.getArguments()].length, 1);
        expect([...builder.getArguments()][0]?.equals(arg.build())).to.equal(true);
    });

    it('testRedirect', () => {
        const target = instance(mock(CommandNode));
        builder.redirect(target);
        assert.deepEqual(builder.getRedirect(), target);
    });

    it('passes the redirect context to a single redirect modifier', () => {
        const dispatcher = new CommandDispatcher<Object>();
        const source = {};
        const context = new CommandContextBuilder(dispatcher, source, dispatcher.getRoot(), 0).build('');
        const singleModifier: SingleRedirectModifier<Object> = {
            apply: (redirectContext) => redirectContext.getSource()
        };

        builder.redirect(instance(mock(CommandNode)), singleModifier);

        expect(builder.getRedirectModifier()?.apply(context)).toEqual([source]);
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
