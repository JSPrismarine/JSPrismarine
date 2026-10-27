import { describe, expect, it } from 'vitest';

import type { ContentBlock, ContentBlockAccess } from '../../content/world/adapter';

import { navigationViewOf } from './navigationView';

const contentBlocks = (get: ContentBlockAccess['get']) =>
    ({
        get,
        set: () => undefined,
        notifyNeighbors: () => undefined,
        data: () => undefined,
        setData: () => undefined,
        light: () => 0,
        power: () => 0,
        isLoaded: () => true,
        surfaceY: () => undefined,
        biome: () => undefined,
        biomeTags: () => []
    }) satisfies ContentBlockAccess;

describe('navigationViewOf', () => {
    it('caches missing cells until the world invalidates block reads', () => {
        let block: ContentBlock | undefined;
        let reads = 0;
        const blocks = contentBlocks(() => {
            reads += 1;
            return block;
        });
        const cached = navigationViewOf(blocks, () => {
            throw new Error('block identifier reads should not resolve block content');
        });
        const at = { x: -1, y: -64, z: 17 };

        expect(cached.view.blockAt(at)).toBeUndefined();
        expect(cached.view.blockAt(at)).toBeUndefined();
        expect(reads).toBe(1);

        block = { identifier: 'minecraft:stone', states: {} };
        expect(cached.view.blockAt(at)).toBeUndefined();
        expect(reads).toBe(1);

        cached.invalidateBlockCache();
        expect(cached.view.blockAt(at)).toBe('minecraft:stone');
        expect(reads).toBe(2);
    });
});
