import { describe, expect, it } from 'vitest';

import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import type Server from '../Server';
import { stub } from '../testing/stub.test.helper';
import { Dimensions } from '../world/DimensionType';
import type { Level } from '../world/Level';
import type { World } from '../world/World';
import { levelScriptAccess } from './levelScriptAccess';

describe('levelScriptAccess', () => {
    it("writes a script's setWaterlogged into the liquid layer: a still water source, or air", () => {
        const writes: [number, number, number, number][] = [];
        const world = stub<World>({
            getDimension: () => Dimensions.Overworld,
            setLoadedLiquidRuntimeId: (x, y, z, runtimeId) => {
                writes.push([x, y, z, runtimeId]);
                return true;
            }
        });
        const access = levelScriptAccess(
            stub<Server>(),
            stub<Level>({ worlds: () => [world].values(), getScoreboard: () => stub() })
        );

        access.setWaterlogged?.('minecraft:overworld', { x: 1, y: -60, z: 2 }, true);
        access.setWaterlogged?.('minecraft:overworld', { x: 1, y: -60, z: 2 }, false);
        access.setWaterlogged?.('minecraft:nether', { x: 1, y: -60, z: 2 }, true);

        expect(writes).toEqual([
            [1, -60, 2, BlockRuntimeIds.tryGetByState('minecraft:water', { liquid_depth: 0 })],
            [1, -60, 2, BlockRuntimeIds.getByName('minecraft:air')]
        ]);
    });
});
