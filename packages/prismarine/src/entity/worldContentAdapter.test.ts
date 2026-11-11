import { describe, expect, it } from 'vitest';

import { Gametype } from '@jsprismarine/minecraft';

import { EYE_HEIGHT } from './playerEyes';
import type { ContentLookup } from '../content/world/views';
import { savedActorNbt } from '../testing/savedActor.test.helper';
import { storeWorld } from '../testing/storeWorld.test.helper';
import { stub } from '../testing/stub.test.helper';
import { sessionOnPrototype } from '../testing/storePlayer.test.helper';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import EntitySerializer from './EntitySerializer';
import { worldEntityAccess } from './worldContentAdapter';

/** Content reads none of these queries make. */
const noContent = (() => {
    throw new Error('entity reads do not need entity content');
}) satisfies ContentLookup;

/** A world over a real store, whose index the queries read, with two stacks and an inert actor. */
const indexedWorld = () => {
    const { world, live } = storeWorld();
    Object.assign(world, { dataEntities: () => live, getEntityIndex: () => live.runtime.index });
    const stack = (x: number, z: number) => {
        const entity = live.dropItem({ x, y: 64, z }, { stack: { name: 'minecraft:dirt', count: 1 } });
        if (entity === undefined) throw new Error('the fixture declares no dropped item');
        return entity;
    };
    const near = stack(0.5, 0.5);
    const inert = live.restoreInert(EntitySerializer.fromNBT(savedActorNbt('test:statue', { x: 2.5, y: 64, z: 0.5 })));
    if (inert === undefined) throw new Error('the fixture declares no inert actor');
    const far = stack(40.5, 0.5);
    return { access: worldEntityAccess({ world: () => world, content: noContent }), near, inert, far };
};

describe('the live entity content adapter', () => {
    it('reports player mode and feet-level position', () => {
        const world = stub<World>();
        const position = new Position(2.5, 64 + EYE_HEIGHT, -1.5, world);
        const player = sessionOnPrototype(
            {},
            // The actor, which is what the adapter reads the id, the position and the tags off.
            { runtimeId: 7n, actor: { getPosition: () => position, getFeetY: () => 64, getTags: () => [] } }
        );
        player.getPlayer().gamemode = Gametype.CREATIVE;
        Object.assign(world, { getViewers: () => [player] });
        const access = worldEntityAccess({ world: () => world, content: noContent });

        expect(access.players()).toMatchObject([
            { creative: true, spectator: false, position: { x: 2.5, y: 64, z: -1.5 } }
        ]);

        player.getPlayer().gamemode = Gametype.SURVIVAL;

        expect(access.players()).toMatchObject([{ creative: false, spectator: false }]);

        player.getPlayer().gamemode = Gametype.SPECTATOR;

        expect(access.players()).toMatchObject([{ creative: false, spectator: true }]);
    });

    it('finds the store entity standing in a block, a dropped stack among them', () => {
        const { access, near, inert } = indexedWorld();

        expect(access.at({ x: 0, y: 64, z: 0 }).map(({ id }) => id)).toEqual([near.id]);
        expect(access.at({ x: 2, y: 64, z: 0 }).map(({ id }) => id)).toEqual([inert.id]);
        expect(access.at({ x: 1, y: 64, z: 0 })).toEqual([]);
    });

    it('answers a radius nearest first, and counts one type within it', () => {
        const { access, near, inert, far } = indexedWorld();

        expect(access.near({ x: 3, y: 64, z: 0.5 }, 4).map(({ id }) => id)).toEqual([inert.id, near.id]);
        expect(access.near({ x: 40, y: 64, z: 0.5 }, 1).map(({ id }) => id)).toEqual([far.id]);
        expect(access.countOfType('minecraft:item', { x: 0, y: 64, z: 0 }, 50)).toBe(2);
        expect(access.countOfType('minecraft:item', { x: 0, y: 64, z: 0 }, 4)).toBe(1);
        expect(access.countOfType('test:statue', { x: 0, y: 64, z: 0 }, 4)).toBe(1);
    });
});
