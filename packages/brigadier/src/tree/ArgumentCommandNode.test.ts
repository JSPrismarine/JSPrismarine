import { assert, beforeEach, describe, it } from 'vitest';
//import type Command from '../Command';
import CommandDispatcher from '../CommandDispatcher';
import StringReader from '../StringReader';
import { DefaultType } from '../arguments/ArgumentType';
import type RequiredArgumentBuilder from '../builder/RequiredArgumentBuilder';
import { argument } from '../builder/RequiredArgumentBuilder';
import CommandContextBuilder from '../context/CommandContextBuilder';
import SuggestionsBuilder from '../suggestion/SuggestionsBuilder';
import type ArgumentCommandNode from '../tree/ArgumentCommandNode';
import RootCommandNode from '../tree/RootCommandNode';

const { integer } = DefaultType;

describe('ArgumentCommandNodeTest', () => {
    //const command: Command<Object> = async () => 0;
    let contextBuilder: CommandContextBuilder<Object>;
    let node: ArgumentCommandNode<Object, number>;

    beforeEach(() => {
        node = argument('foo', integer()).build() as any;
        contextBuilder = new CommandContextBuilder(new CommandDispatcher(), new Object(), new RootCommandNode(), 0);
    });

    it('testParse', () => {
        const reader = new StringReader('123 456');
        node.parse(reader, contextBuilder);

        assert.equal(contextBuilder.getArguments().has('foo'), true);
        assert.equal(contextBuilder.getArguments().get('foo')?.getResult(), 123);
    });

    it('testUsage', () => {
        assert.equal(node.getUsageText(), '<foo>');
    });

    it('testSuggestions', async () => {
        const result = await node.listSuggestions(contextBuilder.build(''), new SuggestionsBuilder('', 0));
        assert.equal(result.isEmpty(), true);
    });

    it.todo('testEquals', () => {
        /*testEquality(argument('foo', integer()).build(), argument('foo', integer()).build());
        testEquality(
            argument('foo', integer()).executes(command).build(),
            argument('foo', integer()).executes(command).build()
        );
        testEquality(argument('bar', integer(-100, 100)).build(), argument('bar', integer(-100, 100)).build());
        testEquality(argument('foo', integer(-100, 100)).build(), argument('foo', integer(-100, 100)).build());
        testEquality(
            argument('foo', integer()).then(argument('bar', integer())).build(),
            argument('foo', integer()).then(argument('bar', integer())).build()
        );*/
    });

    it('testCreateBuilder', () => {
        const builder: RequiredArgumentBuilder<Object, number> = node.createBuilder();
        assert.equal(builder.getName(), node.getName());
        assert.deepEqual(builder.getType(), node.getType());
        assert.deepEqual(builder.getRequirement(), node.getRequirement());
        assert.deepEqual(builder.getCommand(), node.getCommand());
    });
});
