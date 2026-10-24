import { assert, describe, expect, it } from 'vitest';
import type Command from '../Command';
import { literal } from '../builder/LiteralArgumentBuilder';
import type CommandNode from './CommandNode';
import RootCommandNode from './RootCommandNode';

describe('AbstractCommandNodeTest', () => {
    const command: Command<Object> = async () => 0;

    function getCommandNode(): CommandNode<Object> {
        return new RootCommandNode();
    }

    it('testAddChild', () => {
        const node = getCommandNode();

        node.addChild(literal<Object>('child1').build());
        node.addChild(literal<Object>('child2').build());
        node.addChild(literal<Object>('child1').build());

        assert.equal(node.getChildrenCount(), 2);
    });

    it('testAddChildMergesGrandchildren', () => {
        const node = getCommandNode();

        node.addChild(literal<Object>('child').then(literal<Object>('grandchild1')).build());
        node.addChild(literal<Object>('child').then(literal<Object>('grandchild2')).build());

        assert.equal(node.getChildrenCount(), 1);
        assert.equal(node.getChildren().next().value?.getChildrenCount(), 2);
    });

    it('testAddChildPreservesCommand', () => {
        const node = getCommandNode();

        node.addChild(literal<Object>('child').executes(command).build());
        node.addChild(literal<Object>('child').build());

        expect(node.getChildren().next().value?.getCommand()).to.deep.equal(command);
    });

    it('testAddChildOverwritesCommand', () => {
        const node = getCommandNode();

        node.addChild(literal<Object>('child').build());
        node.addChild(literal<Object>('child').executes(command).build());

        expect(node.getChildren().next().value?.getCommand()).to.deep.equal(command);
    });
});
