import { describe, expect, it } from 'vitest';

import type { ContentBlock, ContentBlockAccess } from '../../content/world/adapter';

import { navigationViewOf } from './navigationView';
import { entityFixture } from './testing';

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

    it('keeps cached reads correct while moving between chunks', () => {
        let reads = 0;
        const blocks = contentBlocks((at) => {
            reads += 1;
            return { identifier: `test:${at.x},${at.z}`, states: {} };
        });
        const cached = navigationViewOf(blocks, () => {
            throw new Error('block identifier reads should not resolve block content');
        });
        const positions = [
            { x: -1, y: 0, z: 0 },
            { x: 0, y: 0, z: 0 },
            { x: 16, y: 0, z: 0 },
            { x: 0, y: 0, z: 0 },
            { x: -1, y: 0, z: 0 }
        ];

        for (const position of positions) {
            expect(cached.view.blockAt(position)).toBe(`test:${position.x},${position.z}`);
        }
        for (const position of positions) cached.view.blockAt(position);

        expect(reads).toBe(3);
    });

    it('reads stateless block solidity from the content palette', () => {
        const { content } = entityFixture();
        const blocks = contentBlocks((at) => ({
            identifier: at.y === 0 ? 'minecraft:stone' : 'minecraft:air',
            states: {}
        }));
        const cached = navigationViewOf(blocks, () => content);

        expect(cached.view.isSolid({ x: 0, y: 0, z: 0 })).toBe(true);
        expect(cached.view.isPassable({ x: 0, y: 0, z: 0 })).toBe(false);
        expect(cached.view.isSolid({ x: 0, y: 1, z: 0 })).toBe(false);
        expect(cached.view.isPassable({ x: 0, y: 1, z: 0 })).toBe(true);
    });
});
