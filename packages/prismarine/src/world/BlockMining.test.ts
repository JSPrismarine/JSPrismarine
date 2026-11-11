import { describe, expect, it } from 'vitest';

import { Vector3 } from '@jsprismarine/math';

import { blockMiningOf, playerMiningOf } from './BlockMining';

describe('the mining conversions', () => {
    it('carry a block between the world and the component and back', () => {
        const mining = { position: new Vector3(3, 64, -2), face: 1, runtimeId: 42, progressPerTick: 1200 };

        expect(playerMiningOf(mining)).toEqual({ x: 3, y: 64, z: -2, face: 1, runtimeId: 42, progressPerTick: 1200 });
        expect(blockMiningOf(playerMiningOf(mining))).toEqual(mining);
    });

    it('answer null for null, which is a player mining nothing', () => {
        expect(playerMiningOf(null)).toBeNull();
        expect(blockMiningOf(null)).toBeNull();
    });
});
