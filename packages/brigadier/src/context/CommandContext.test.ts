import { assert, beforeEach, describe, it } from 'vitest';
import CommandDispatcher from '../CommandDispatcher';
import CommandContextBuilder from '../context/CommandContextBuilder';
import ParsedArgument from '../context/ParsedArgument';
import RootCommandNode from '../tree/RootCommandNode';

describe('CommandContextTest', () => {
    let builder: CommandContextBuilder<Object>;
    const source = {};
    const rootNode = new RootCommandNode<Object>();
    const dispatcher = new CommandDispatcher<Object>(rootNode);

    beforeEach(() => {
        builder = new CommandContextBuilder(dispatcher, source, rootNode, 0);
    });

    it('testGetArgument_nonexistent', async () => {
        try {
            builder.build('').getArgument('foo');
        } catch {
            return;
        }

        assert.fail();
    });

    it('testGetArgument_noConverter', async () => {
        try {
            const context = builder.withArgument('foo', new ParsedArgument(0, 1, Object.create(null))).build('123');
            context.getArgument('foo', String);
        } catch {
            return;
        }

        assert.fail();
    });

    it('testGetArgument', () => {
        const context = builder.withArgument('foo', new ParsedArgument(0, 1, 123)).build('123');
        assert.equal(context.getArgument('foo', Number), 123);
    });

    it('testSource', () => {
        assert.deepEqual(builder.build('').getSource(), source);
    });

    it('testRootNode', () => {
        assert.deepEqual(builder.build('').getRootNode(), rootNode);
    });
});
