import { describe, expect, it } from 'vitest';

import type { TickingAreaWorld } from './TickingAreas';
import { chunkCountOf, chunksOfBlocks, TickingAreas } from './TickingAreas';
import type { ChunkRectangle } from './World';

/** A world that records the areas it was asked to keep, and holds every chunk loaded. */
class RecordingWorld implements TickingAreaWorld {
    public readonly kept = new Map<string, ChunkRectangle>();

    public setTickingArea(owner: string, area: ChunkRectangle | undefined): void {
        if (area === undefined) this.kept.delete(owner);
        else this.kept.set(owner, area);
    }

    public isTickingAreaLoaded(owner: string): boolean {
        return this.kept.has(owner);
    }
}

describe('TickingAreas', () => {
    it('covers the chunks a block box touches, whichever corners it is given', () => {
        expect(chunksOfBlocks({ x: 17.5, z: 40 }, { x: -20, z: -3 })).toEqual({ minX: -2, maxX: 1, minZ: -1, maxZ: 2 });
        expect(chunkCountOf({ minX: -2, maxX: 1, minZ: -1, maxZ: 2 })).toBe(16);
    });

    it("keeps the scripts' areas and the command's apart, and hands each to its dimension's world", () => {
        const overworld = new RecordingWorld();
        const areas = new TickingAreas((dimension) => (dimension === 'minecraft:overworld' ? overworld : undefined));
        const chunks = { minX: 0, maxX: 1, minZ: 0, maxZ: 0 };

        expect(areas.add({ name: 'home', owner: 'script', dimension: 'minecraft:overworld', chunks })).toBe(true);
        expect(areas.add({ name: 'home', owner: 'command', dimension: 'minecraft:overworld', chunks })).toBe(true);
        expect(areas.add({ name: 'home', owner: 'script', dimension: 'minecraft:overworld', chunks })).toBe(false);
        expect(areas.list('script').map((area) => area.owner)).toEqual(['script']);
        expect(areas.chunkCount('command')).toBe(2);
        expect([...overworld.kept.keys()]).toEqual(['script:home', 'command:home']);
        expect(areas.list('script').map((area) => areas.isLoaded(area))).toEqual([true]);

        expect(areas.remove('command', 'home')).toBe(true);
        expect(areas.remove('command', 'home')).toBe(false);
        expect([...overworld.kept.keys()]).toEqual(['script:home']);
    });
});
