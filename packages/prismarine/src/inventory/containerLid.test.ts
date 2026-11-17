/** A chest's lid follows how many players have it open, on both halves of a double chest. */
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import type { BlockEntityData, ContentPosition } from '../content/world/adapter';
import type { ServerContent } from '../content/ServerContent';
import type PlayerSession from '../network/PlayerSession';
import type { OpenBlockContainer } from '../network/PlayerSession';
import type Server from '../Server';
import { stub } from '../testing/stub.test.helper';
import type { World } from '../world/World';
import { hasContainerLid, showContainerLid } from './containerLid';

const LEFT = { x: 0, y: 64, z: 0 };
const RIGHT = { x: 1, y: 64, z: 0 };

/** A world holding chests at `chests`, whose players have open what `open` lists. */
const worldWith = (chests: Map<string, BlockEntityData>, open: (OpenBlockContainer | undefined)[]) => {
    const key = (at: ContentPosition) => `${at.x},${at.y},${at.z}`;
    const events: { at: ContentPosition; type: number; value: number }[] = [];
    const blocks = {
        getBlockData: (at: ContentPosition) => chests.get(key(at)),
        getBlock: (at: ContentPosition) =>
            chests.has(key(at))
                ? { identifier: 'minecraft:chest', states: {}, position: at, dimension: 'minecraft:overworld' }
                : undefined
    };
    const content = stub<ServerContent>({
        world: stub<ServerContent['world']>({
            blockWorld: stub<ServerContent['world']['blockWorld']>({
                at: () => stub<ReturnType<ServerContent['world']['blockWorld']['at']>>(blocks)
            })
        })
    });
    const world = stub<World>({
        getServer: () => stub<Server>({ getContent: () => content }),
        getDimension: () => stub<ReturnType<World['getDimension']>>({ name: 'minecraft:overworld' }),
        getLevel: () => stub<ReturnType<World['getLevel']>>({ name: 'world' }),
        getViewers: () => open.map((container) => stub<PlayerSession>({ getOpenBlockContainer: () => container })),
        sendBlockEvent: (at, type, value) => void events.push({ at, type, value })
    });
    return { world, events };
};

const openAt = (at: ContentPosition): OpenBlockContainer =>
    stub<OpenBlockContainer>({ position: new Vector3(at.x, at.y, at.z), identifier: 'minecraft:chest' });

describe('a container lid', () => {
    it('is sent the count of players with the chest open', () => {
        const { world, events } = worldWith(new Map([['0,64,0', {}]]), [openAt(LEFT), openAt(LEFT), undefined]);

        showContainerLid(world, LEFT, 'minecraft:chest');

        expect(events).toEqual([{ at: LEFT, type: 1, value: 2 }]);
    });

    it('closes when nobody has the chest open', () => {
        const { world, events } = worldWith(new Map([['0,64,0', {}]]), [undefined]);

        showContainerLid(world, LEFT, 'minecraft:chest');

        expect(events).toEqual([{ at: LEFT, type: 1, value: 0 }]);
    });

    it('opens both halves of a double chest for a player looking into either', () => {
        const chests = new Map<string, BlockEntityData>([
            ['0,64,0', { pairedWith: RIGHT }],
            ['1,64,0', { pairedWith: LEFT }]
        ]);
        const { world, events } = worldWith(chests, [openAt(RIGHT)]);

        showContainerLid(world, LEFT, 'minecraft:chest');

        expect(events).toEqual([
            { at: LEFT, type: 1, value: 1 },
            { at: RIGHT, type: 1, value: 1 }
        ]);
    });

    it('belongs to chests and shulker boxes, not to a barrel or a furnace', () => {
        for (const identifier of ['minecraft:chest', 'minecraft:trapped_chest', 'minecraft:ender_chest'])
            expect(hasContainerLid(identifier)).toBe(true);
        expect(hasContainerLid('minecraft:red_shulker_box')).toBe(true);
        expect(hasContainerLid('minecraft:barrel')).toBe(false);
        expect(hasContainerLid('minecraft:furnace')).toBe(false);
    });
});
