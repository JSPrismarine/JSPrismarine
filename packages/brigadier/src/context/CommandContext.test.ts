import { assert, beforeEach, describe, it } from 'vitest';
import CommandDispatcher from '../CommandDispatcher';
import CommandContextBuilder from '../context/CommandContextBuilder';
import ParsedArgument from '../context/ParsedArgument';
import RootCommandNode from '../tree/RootCommandNode';

describe('CommandContextTest', () => {
    let builder: CommandContextBuilder<Object>;
    const source = {};
    const rootNode = new RootCommandNode() as any;
    const dispatcher = new CommandDispatcher<Object>(rootNode) as any;

    beforeEach(() => {
        builder = new CommandContextBuilder(dispatcher, source, rootNode, 0);
    });

    it('testGetArgument_nonexistent', async () => {
        try {
            builder.build('').getArgument('foo');
        } catch (ex: any) {
            return;
        }

        assert.fail();
    });

    it('testGetArgument_noConverter', async () => {
        try {
            const context = builder.withArgument('foo', new ParsedArgument(0, 1, Object.create(null))).build('123');
            context.getArgument('foo', String);
        } catch (ex: any) {
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

    it.todo('testEquals', () => {
        /*const otherSource = new Object();
        const command = async () => 1;
        const otherCommand = async () => 2;

        const mockedCommandNode = mock(CommandNode);
        const rootNode = new RootCommandNode();
        const otherRootNode = new RootCommandNode();
        const node = instance(mockedCommandNode);
        const otherNode = instance(mockedCommandNode);

        testEquality(
            new CommandContextBuilder(dispatcher, source, rootNode, 0).build(''),
            new CommandContextBuilder(dispatcher, source, rootNode, 0).build('')
        );
        testEquality(
            new CommandContextBuilder(dispatcher, source, otherRootNode, 0).build(''),
            new CommandContextBuilder(dispatcher, source, otherRootNode, 0).build('')
        );
        testEquality(
            new CommandContextBuilder(dispatcher, otherSource, rootNode, 0).build(''),
            new CommandContextBuilder(dispatcher, otherSource, rootNode, 0).build('')
        );
        testEquality(
            new CommandContextBuilder(dispatcher, source, rootNode, 0).withCommand(command).build(''),
            new CommandContextBuilder(dispatcher, source, rootNode, 0).withCommand(command).build('')
        );
        testEquality(
            new CommandContextBuilder(dispatcher, source, rootNode, 0).withCommand(otherCommand).build(''),
            new CommandContextBuilder(dispatcher, source, rootNode, 0).withCommand(otherCommand).build('')
        );
        testEquality(
            new CommandContextBuilder(dispatcher, source, rootNode, 0)
                .withArgument('foo', new ParsedArgument(0, 1, 123))
                .build('123'),
            new CommandContextBuilder(dispatcher, source, rootNode, 0)
                .withArgument('foo', new ParsedArgument(0, 1, 123))
                .build('123')
        );
        testEquality(
            new CommandContextBuilder(dispatcher, source, rootNode, 0)
                .withNode(node, StringRange.between(0, 3))
                .withNode(otherNode, StringRange.between(4, 6))
                .build('123 456'),
            new CommandContextBuilder(dispatcher, source, rootNode, 0)
                .withNode(node, StringRange.between(0, 3))
                .withNode(otherNode, StringRange.between(4, 6))
                .build('123 456')
        );
        testEquality(
            new CommandContextBuilder(dispatcher, source, rootNode, 0)
                .withNode(otherNode, StringRange.between(0, 3))
                .withNode(node, StringRange.between(4, 6))
                .build('123 456'),
            new CommandContextBuilder(dispatcher, source, rootNode, 0)
                .withNode(otherNode, StringRange.between(0, 3))
                .withNode(node, StringRange.between(4, 6))
                .build('123 456')
        );*/
    });
});
