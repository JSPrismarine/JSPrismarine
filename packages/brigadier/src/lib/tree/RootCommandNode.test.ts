import { assert, expect, describe, beforeEach, it } from 'vitest';
import { mock, instance } from 'ts-mockito';
import RootCommandNode from '../tree/RootCommandNode';
import CommandContext from '../context/CommandContext';
import StringReader from '../StringReader';
import CommandContextBuilder from '../context/CommandContextBuilder';
import SuggestionsBuilder from '../suggestion/SuggestionsBuilder';
import { literal } from '../builder/LiteralArgumentBuilder';
import CommandDispatcher from '../CommandDispatcher';

describe('RootCommandNodeTest', () => {
    let node: RootCommandNode<Object>;

    beforeEach(() => {
        node = new RootCommandNode();
    });

    it('testParse', () => {
        const reader = new StringReader('hello world');
        node.parse(reader, new CommandContextBuilder(new CommandDispatcher(), new Object(), new RootCommandNode(), 0));
        assert.equal(reader.getCursor(), 0);
    });

    it('testAddChildNoRoot', async () => {
        try {
            node.addChild(new RootCommandNode());
        } catch (ex) {
            expect(ex instanceof Error).to.equal(true);
            return;
        }

        assert.fail();
    });

    it('testUsage', () => {
        assert.equal(node.getUsageText(), '');
    });

    it('testSuggestions', async () => {
        const context = instance(mock(CommandContext));
        const result = await node.listSuggestions(context, new SuggestionsBuilder('', 0));
        assert.equal(result.isEmpty(), true);
    });

    it('testCreateBuilder', async () => {
        try {
            node.createBuilder();
        } catch (ex) {
            expect(ex instanceof Error).to.equal(true);
            return;
        }

        assert.fail();
    });

    it('testEquals', () => {
        assert.equal(new RootCommandNode().equals(new RootCommandNode()), true);

        const temp1 = new RootCommandNode<Object>();
        temp1.addChild(literal('foo').build());
        const temp2 = new RootCommandNode<Object>();
        temp2.addChild(literal('foo').build());

        assert.equal(temp1.equals(temp2), true);
    });
});
