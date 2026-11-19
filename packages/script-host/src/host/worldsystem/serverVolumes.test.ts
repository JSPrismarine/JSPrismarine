import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { loadLibrary, scriptHostAvailable } from '../../testing/library.test-utils';
import { SystemScripts } from './serverWorld.test-utils';

const harness = new SystemScripts(loadLibrary);
afterEach(() => harness.stopAll());
afterAll(() => harness.removeAll());

describe.skipIf(!scriptHostAvailable())("a dimension's cloneBlocks", () => {
    it('copies, moves and filters a region, and refuses an overlap unless forced', () => {
        const { lines } = harness.start(
            `
            world.afterEvents.worldLoad.subscribe(() => {
                const overworld = world.getDimension('overworld');
                const at = (x, y, z) => overworld.getBlock({ x, y, z }).typeId;
                overworld.setBlockType({ x: 0, y: 20, z: 0 }, 'stone');
                overworld.setBlockType({ x: 1, y: 20, z: 0 }, 'oak_log');
                log('copy', () => { overworld.cloneBlocks({ x: 0, y: 20, z: 0 }, { x: 1, y: 20, z: 0 }, { x: 5, y: 20, z: 0 }, server.CloneMode.Copy); return [at(5, 20, 0), at(6, 20, 0), at(0, 20, 0)]; });
                log('filter', () => { overworld.cloneBlocks({ x: 0, y: 20, z: 0 }, { x: 1, y: 20, z: 0 }, { x: 8, y: 20, z: 0 }, server.CloneMode.Copy, { includeTypes: ['oak_log'] }); return [at(8, 20, 0), at(9, 20, 0)]; });
                log('move', () => { overworld.cloneBlocks({ x: 5, y: 20, z: 0 }, { x: 5, y: 20, z: 0 }, { x: 12, y: 20, z: 0 }, server.CloneMode.Move); return [at(5, 20, 0), at(12, 20, 0)]; });
                log('overlap', () => overworld.cloneBlocks({ x: 0, y: 20, z: 0 }, { x: 1, y: 20, z: 0 }, { x: 1, y: 20, z: 0 }, server.CloneMode.Copy));
                log('forced', () => { overworld.cloneBlocks({ x: 0, y: 20, z: 0 }, { x: 1, y: 20, z: 0 }, { x: 1, y: 20, z: 0 }, server.CloneMode.ForceCopy); return at(2, 20, 0); });
                log('above', () => overworld.cloneBlocks({ x: 0, y: 20, z: 0 }, { x: 0, y: 20, z: 0 }, { x: 0, y: 400, z: 0 }, server.CloneMode.Copy));
            });`
        );
        expect(lines).toEqual([
            'copy ["minecraft:stone","minecraft:oak_log","minecraft:stone"]',
            'filter ["minecraft:air","minecraft:oak_log"]',
            'move ["minecraft:air","minecraft:stone"]',
            'overlap ! Error: Source and destination can not overlap.',
            'forced "minecraft:oak_log"',
            'above ! LocationOutOfWorldBoundariesError: One of the provided locations caused the operation to go out of world bounds.. Trying to access location (0.0, 400.0, 0.0) which is outside of the world boundaries.'
        ]);
    });
});
