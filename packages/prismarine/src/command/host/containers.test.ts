import { describe, expect, it } from 'vitest';

import { buildServerContent } from '../../content/ServerContent';
import { fixtureContentOptions } from '../../content/testing';
import type { ContentItemDrop } from '../../content/world/adapter';
import type { BlockContainerSlots } from './containers';
import { insertIntoContainer } from './containers';

const content = buildServerContent(fixtureContentOptions());

/** A container of a given size, over a plain array, so a test can read the slots back. */
const container = (size: number, held: readonly (ContentItemDrop | undefined)[] = []) => {
    const slots = Array.from({ length: size }, (_unused, slot) => held[slot]);
    let committed = 0;

    const api: BlockContainerSlots = {
        size,
        get: (slot) => slots[slot],
        set: (slot, drop) => {
            slots[slot] = drop;
        },
        commit: () => {
            committed += 1;
        }
    };
    return { api, slots, commits: () => committed };
};

const stone = (count: number): ContentItemDrop => ({ identifier: 'minecraft:stone', count });

describe('insertIntoContainer', () => {
    it('takes the first empty slot and reports what went in', () => {
        const chest = container(3);

        expect(insertIntoContainer(chest.api, content, [stone(5)])).toBe(5);
        expect(chest.slots).toEqual([stone(5), undefined, undefined]);
    });

    it('grows a matching stack before it opens a new slot', () => {
        const chest = container(3, [stone(10)]);

        expect(insertIntoContainer(chest.api, content, [stone(7)])).toBe(7);
        expect(chest.slots).toEqual([stone(17), undefined, undefined]);
    });

    it('spills a stack past the limit into the next slot', () => {
        const chest = container(3, [stone(60)]);

        expect(insertIntoContainer(chest.api, content, [stone(10)])).toBe(10);
        expect(chest.slots).toEqual([stone(64), stone(6), undefined]);
    });

    it('leaves behind what a full container had no room for', () => {
        // Java's rule: a stack that half fits puts in the half and drops the
        // rest, and the count it reports is the half.
        const chest = container(1, [stone(60)]);

        expect(insertIntoContainer(chest.api, content, [stone(10)])).toBe(4);
        expect(chest.slots).toEqual([stone(64)]);
    });

    it('reports nothing for a container with no room at all', () => {
        const chest = container(1, [stone(64)]);

        expect(insertIntoContainer(chest.api, content, [stone(1)])).toBe(0);
    });

    it('keeps an enchanted stack apart from a plain one', () => {
        const held: ContentItemDrop = {
            identifier: 'minecraft:diamond_pickaxe',
            count: 1,
            enchantments: { 'minecraft:fortune': 3 }
        };
        const chest = container(2, [held]);

        expect(insertIntoContainer(chest.api, content, [{ identifier: 'minecraft:diamond_pickaxe', count: 1 }])).toBe(
            1
        );
        expect(chest.slots[0]).toBe(held);
        expect(chest.slots[1]).toEqual({ identifier: 'minecraft:diamond_pickaxe', count: 1 });
    });

    it('writes nothing of its own; the caller commits', () => {
        const chest = container(2);

        insertIntoContainer(chest.api, content, [stone(1)]);

        expect(chest.commits()).toBe(0);
    });
});
