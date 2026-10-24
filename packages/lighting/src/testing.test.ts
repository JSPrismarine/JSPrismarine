import { describe, expect, it } from 'vitest';

import { AIR, TestBlockLightView, lightBlock } from './testing';

describe('TestBlockLightView', () => {
    it('answers with air where nothing was placed', () => {
        const view = new TestBlockLightView();

        expect(view.blockAt(4, 10, -7)).toEqual(AIR);
    });

    it('answers with the placed block', () => {
        const view = new TestBlockLightView();
        const stone = lightBlock({ lightDampening: 15 });

        view.place(4, 10, -7, stone);

        expect(view.blockAt(4, 10, -7)).toBe(stone);
    });

    it('reports an unloaded chunk as undefined rather than as a block', () => {
        const view = new TestBlockLightView();

        view.unloadChunk(0, 0);

        expect(view.blockAt(5, 10, 5)).toBeUndefined();
        expect(view.blockAt(-1, 10, 5)).toEqual(AIR);
    });

    it('takes the dimension bounds from its options', () => {
        const view = new TestBlockLightView({ minY: 0, maxY: 128, hasSkyLight: false });

        expect(view.minY).toBe(0);
        expect(view.maxY).toBe(128);
        expect(view.hasSkyLight).toBe(false);
    });
});
