import { assert, expect, describe, beforeEach, it } from 'vitest';
import testEquality from '../util/isEqual.test';
import { DefaultType } from '../arguments/ArgumentType';
import Command from '../Command';
import CommandNode from '../tree/CommandNode';
import RootCommandNode from '../tree/RootCommandNode';
import CommandDispatcher from '../CommandDispatcher';
import ArgumentCommandNode from '../tree/ArgumentCommandNode';
import CommandContextBuilder from '../context/CommandContextBuilder';
import RequiredArgumentBuilder, { argument } from '../builder/RequiredArgumentBuilder';
import SuggestionsBuilder from '../suggestion/SuggestionsBuilder';
import StringReader from '../StringReader';

const { integer } = DefaultType;

describe('ArgumentCommandNodeTest', () => {
    const command: Command<Object> = async () => 0;
    let contextBuilder: CommandContextBuilder<Object>;
    let node: ArgumentCommandNode<Object, number>;

    function getCommandNode(): CommandNode<Object> {
        return node;
    }

    beforeEach(() => {
        node = argument('foo', integer()).build();
        contextBuilder = new CommandContextBuilder(new CommandDispatcher(), new Object(), new RootCommandNode(), 0);
    });

    it('testParse', () => {
        const reader = new StringReader('123 456');
        node.parse(reader, contextBuilder);

        assert.equal(contextBuilder.getArguments().has('foo'), true);
        assert.equal(contextBuilder.getArguments().get('foo').getResult(), 123);
    });

    it('testUsage', () => {
        assert.equal(node.getUsageText(), '<foo>');
    });

    it('testSuggestions', async () => {
        const result = await node.listSuggestions(contextBuilder.build(''), new SuggestionsBuilder('', 0));
        assert.equal(result.isEmpty(), true);
    });

    it('testEquals', () => {
        testEquality(argument('foo', integer()).build(), argument('foo', integer()).build());
        testEquality(
            argument('foo', integer()).executes(command).build(),
            argument('foo', integer()).executes(command).build()
        );
        testEquality(argument('bar', integer(-100, 100)).build(), argument('bar', integer(-100, 100)).build());
        testEquality(argument('foo', integer(-100, 100)).build(), argument('foo', integer(-100, 100)).build());
        testEquality(
            argument('foo', integer()).then(argument('bar', integer())).build(),
            argument('foo', integer()).then(argument('bar', integer())).build()
        );
    });

    it('testCreateBuilder', () => {
        const builder: RequiredArgumentBuilder<Object, number> = node.createBuilder();
        assert.equal(builder.getName(), node.getName());
        assert.deepEqual(builder.getType(), node.getType());
        assert.deepEqual(builder.getRequirement(), node.getRequirement());
        assert.deepEqual(builder.getCommand(), node.getCommand());
    });
});
