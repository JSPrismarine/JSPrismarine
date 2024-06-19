import { assert, beforeEach, describe, expect, it } from 'vitest';
import CommandDispatcher from '../CommandDispatcher';
import StringReader from '../StringReader';
import { literal } from '../builder/LiteralArgumentBuilder';
import CommandContextBuilder from '../context/CommandContextBuilder';
import StringRange from '../context/StringRange';
import CommandSyntaxException from '../exceptions/CommandSyntaxException';
import Suggestion from '../suggestion/Suggestion';
import SuggestionsBuilder from '../suggestion/SuggestionsBuilder';
import type LiteralCommandNode from '../tree/LiteralCommandNode';
import RootCommandNode from '../tree/RootCommandNode';

describe('LiteralCommandNodeTest', () => {
    let node: LiteralCommandNode<Object>;
    let contextBuilder: CommandContextBuilder<Object>;

    beforeEach(() => {
        node = literal('foo').build() as any;
        contextBuilder = new CommandContextBuilder(new CommandDispatcher(), new Object(), new RootCommandNode(), 0);
    });

    it('testParse', () => {
        const reader = new StringReader('foo bar');
        node.parse(reader, contextBuilder);
        assert.equal(reader.getRemaining(), ' bar');
    });

    it('testParseExact', () => {
        const reader = new StringReader('foo');
        node.parse(reader, contextBuilder);
        assert.equal(reader.getRemaining(), '');
    });

    it('testParseSimilar', async () => {
        const reader = new StringReader('foobar');
        try {
            node.parse(reader, contextBuilder);
        } catch (ex: any) {
            assert.equal(ex.getType(), CommandSyntaxException.BUILT_IN_EXCEPTIONS.literalIncorrect());
            assert.equal(ex.getCursor(), 0);
            return;
        }

        assert.fail();
    });

    it('testParseInvalid', async () => {
        const reader = new StringReader('bar');
        try {
            node.parse(reader, contextBuilder);
        } catch (ex: any) {
            assert.equal(ex.getType(), CommandSyntaxException.BUILT_IN_EXCEPTIONS.literalIncorrect());
            assert.equal(ex.getCursor(), 0);
            return;
        }

        assert.fail();
    });

    it('testUsage', () => {
        assert.equal(node.getUsageText(), 'foo');
    });

    it('testSuggestions', async () => {
        const empty = await node.listSuggestions(contextBuilder.build(''), new SuggestionsBuilder('', 0));
        expect(empty.getList()).to.deep.equal([new Suggestion(StringRange.at(0), 'foo')]);

        const foo = await node.listSuggestions(contextBuilder.build('foo'), new SuggestionsBuilder('foo', 0));
        assert.equal(foo.isEmpty(), true);

        const food = await node.listSuggestions(contextBuilder.build('food'), new SuggestionsBuilder('food', 0));
        assert.equal(food.isEmpty(), true);

        const b = await node.listSuggestions(contextBuilder.build('b'), new SuggestionsBuilder('b', 0));
        assert.equal(b.isEmpty(), true);
    });

    it.todo('testEquals', () => {
        /*const command = async () => 0;

        testEquality(literal('foo').build(), literal('foo').build());
        testEquality(literal('bar').executes(command).build(), literal('bar').executes(command).build());
        testEquality(literal('bar').build(), literal('bar').build());
        testEquality(literal('foo').then(literal('bar')).build(), literal('foo').then(literal('bar')).build());*/
    });

    it('testCreateBuilder', () => {
        const builder = node.createBuilder();
        assert.deepEqual(builder.getLiteral(), node.getLiteral());
        assert.deepEqual(builder.getRequirement(), node.getRequirement());
        assert.deepEqual(builder.getCommand(), node.getCommand());
    });
});
