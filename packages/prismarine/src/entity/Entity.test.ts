import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it, vi } from 'vitest';

import { testEntityServer } from '../testing/entityServer';
import { stub } from '../testing/stub.test.helper';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import { Entity } from './Entity';

const entityAt = (x: number, y: number, z: number) => {
    const broadcastMove = vi.fn<World['broadcastMove']>(async () => {});
    const world = stub<World>({
        getName: () => 'test',
        getServer: () => testEntityServer(),
        broadcastMove
    });
    return { entity: new Entity({ position: new Position(x, y, z, world) }), broadcastMove };
};

describe('entity', () => {
    describe('Entity', () => {
        describe('setPosition', () => {
            it('moves the entity and tells the world', async () => {
                const { entity, broadcastMove } = entityAt(0, 64, 0);

                await entity.setPosition({ position: new Vector3(1.5, 70, -2.5) });

                expect(entity.getPosition().getX()).toBe(1.5);
                expect(entity.getPosition().getY()).toBe(70);
                expect(entity.getPosition().getZ()).toBe(-2.5);
                expect(broadcastMove).toHaveBeenCalledWith(entity);
            });

            // A NaN position used to be stored and broadcast, and only failed later, deep in
            // packet encoding, with the server already holding a position no client can show.
            it.each([
                [new Vector3(Number.NaN, 0, 0)],
                [new Vector3(0, Number.NaN, 0)],
                [new Vector3(0, 0, Number.NaN)],
                [new Vector3(Number.POSITIVE_INFINITY, 0, 0)],
                [new Vector3(0, Number.NEGATIVE_INFINITY, 0)]
            ])('refuses to move to %s and stays put', async (position) => {
                const { entity, broadcastMove } = entityAt(10, 64, 20);

                await expect(entity.setPosition({ position })).rejects.toThrow(RangeError);

                expect(entity.getPosition().getX()).toBe(10);
                expect(entity.getPosition().getY()).toBe(64);
                expect(entity.getPosition().getZ()).toBe(20);
                expect(broadcastMove).not.toHaveBeenCalled();
            });
        });
    });
});
