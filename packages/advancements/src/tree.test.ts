import { describe, expect, it } from 'vitest';

import { parseAdvancement } from './model';
import type { ParsedAdvancement } from './model';
import { buildAdvancementTree } from './tree';

const advancement = (id: string, parent?: string): ParsedAdvancement => {
    const { value } = parseAdvancement(id, { parent, criteria: { t: { trigger: 'minecraft:tick' } } });
    if (!value) throw new Error(`the fixture ${id} did not parse`);
    return value;
};

describe('building the advancement tree', () => {
    it('links a child under its parent', () => {
        const { tree, diagnostics } = buildAdvancementTree([
            advancement('minecraft:story/root'),
            advancement('minecraft:story/mine_stone', 'minecraft:story/root')
        ]);

        expect(diagnostics).toEqual([]);
        expect(tree.roots.map((node) => node.id)).toEqual(['minecraft:story/root']);
        expect(tree.roots[0]?.children.map((node) => node.id)).toEqual(['minecraft:story/mine_stone']);
        expect(tree.nodes.get('minecraft:story/mine_stone')?.parent?.id).toBe('minecraft:story/root');
    });

    it('resolves a parent declared after its child', () => {
        const { tree } = buildAdvancementTree([advancement('minecraft:b', 'minecraft:a'), advancement('minecraft:a')]);

        expect(tree.nodes.get('minecraft:b')?.parent?.id).toBe('minecraft:a');
        expect(tree.roots.map((node) => node.id)).toEqual(['minecraft:a']);
    });

    it('reports a parent that was not loaded and leaves the node a root', () => {
        const { tree, diagnostics } = buildAdvancementTree([advancement('minecraft:b', 'minecraft:missing')]);

        expect(diagnostics).toEqual([
            { severity: 'error', path: 'minecraft:b', message: 'parent minecraft:missing is not a loaded advancement' }
        ]);
        expect(tree.roots.map((node) => node.id)).toEqual(['minecraft:b']);
    });

    it('reports an advancement that is its own parent', () => {
        const { tree, diagnostics } = buildAdvancementTree([advancement('minecraft:a', 'minecraft:a')]);

        expect(diagnostics).toEqual([
            { severity: 'error', path: 'minecraft:a', message: 'parent chain is cyclic through minecraft:a' }
        ]);
        expect(tree.nodes.get('minecraft:a')?.parent).toBeUndefined();
    });

    it('breaks a two-advancement cycle and keeps both reachable', () => {
        const { tree, diagnostics } = buildAdvancementTree([
            advancement('minecraft:a', 'minecraft:b'),
            advancement('minecraft:b', 'minecraft:a')
        ]);

        expect(diagnostics).toEqual([
            { severity: 'error', path: 'minecraft:a', message: 'parent chain is cyclic through minecraft:a' }
        ]);
        expect(tree.roots.map((node) => node.id)).toEqual(['minecraft:a']);
        expect(tree.nodes.get('minecraft:b')?.parent?.id).toBe('minecraft:a');
    });

    it('breaks a three-advancement cycle', () => {
        const { tree, diagnostics } = buildAdvancementTree([
            advancement('minecraft:a', 'minecraft:c'),
            advancement('minecraft:b', 'minecraft:a'),
            advancement('minecraft:c', 'minecraft:b')
        ]);

        expect(diagnostics).toHaveLength(1);
        expect(tree.roots).toHaveLength(1);
        expect(tree.nodes.size).toBe(3);
    });
});
