import { assert, expect, describe, it } from 'vitest';
import type Command from '../Command';
import type CommandNode from '../tree/CommandNode';
import RootCommandNode from '../tree/RootCommandNode';
import { literal } from '../builder/LiteralArgumentBuilder';

describe('AbstractCommandNodeTest', () => {
    const command: Command<Object> = async () => 0;

    function getCommandNode(): CommandNode<Object> {
        return new RootCommandNode();
    }

    it('testAddChild', () => {
        const node = getCommandNode() as any;

        node.addChild(literal('child1').build());
        node.addChild(literal('child2').build());
        node.addChild(literal('child1').build());

        assert.equal(node.getChildrenCount(), 2);
    });

    it('testAddChildMergesGrandchildren', () => {
        const node = getCommandNode() as any;

        node.addChild(literal('child').then(literal('grandchild1')).build());
        node.addChild(literal('child').then(literal('grandchild2')).build());

        assert.equal(node.getChildrenCount(), 1);
        assert.equal(node.getChildren().next().value.getChildrenCount(), 2);
    });

    it('testAddChildPreservesCommand', () => {
        const node = getCommandNode() as any;

        node.addChild(literal('child').executes(command).build());
        node.addChild(literal('child').build());

        expect(node.getChildren().next().value.getCommand()).to.deep.equal(command);
    });

    it('testAddChildOverwritesCommand', () => {
        const node = getCommandNode() as any;

        node.addChild(literal('child').build());
        node.addChild(literal('child').executes(command).build());

        expect(node.getChildren().next().value.getCommand()).to.deep.equal(command);
    });
});
