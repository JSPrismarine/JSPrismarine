import { describe, expect, it } from 'vitest';

import type { ScriptWorldEvent } from '@jsprismarine/script-host/host/world';

import PlayerBlockBrokenEvent from '../events/player/PlayerBlockBrokenEvent';
import PlayerBlockInteractedEvent from '../events/player/PlayerBlockInteractedEvent';
import PlayerBreakBlockEvent from '../events/player/PlayerBreakBlockEvent';
import PlayerEntityInteractedEvent from '../events/player/PlayerEntityInteractedEvent';
import PlayerInteractBlockEvent from '../events/player/PlayerInteractBlockEvent';
import PlayerInteractEntityEvent from '../events/player/PlayerInteractEntityEvent';
import PlayerItemUsedEvent from '../events/player/PlayerItemUsedEvent';
import PlayerUseItemEvent from '../events/player/PlayerUseItemEvent';
import type { Item } from '../item/Item';
import type Server from '../Server';
import { testKernel } from '../testing/kernel.test.helper';
import { stub } from '../testing/stub.test.helper';
import type { Level } from '../world/Level';
import type { World } from '../world/World';
import { levelPlayerActions } from './scriptPlayerActions';

const level = stub<Level>();
const elsewhere = stub<Level>();
const worldOf = (owner: Level): World =>
    stub<World>({
        getLevel: () => owner,
        getDimension: () => stub<ReturnType<World['getDimension']>>({ bedrockName: 'minecraft:overworld' })
    });
const stick = stub<Item>({
    getName: () => 'minecraft:stick',
    getAmount: () => 1,
    getCustomName: () => undefined,
    getLore: () => [],
    getCanDestroyBlocks: () => [],
    getCanPlaceOnBlocks: () => [],
    getMaxDurability: () => 0,
    getDurability: () => 0
});
const block = { x: 1, y: -60, z: 2, name: 'minecraft:stone', states: {} };

describe("a level's player actions, as its scripts see them", () => {
    it("cancels the server's event when a script's guard vetoes it, for the level's players only", () => {
        const kernel = testKernel();
        const actions = levelPlayerActions(stub<Server>({ getKernel: () => kernel }), level);
        const seen: string[] = [];
        actions.guardBlockBreak((intent) => {
            seen.push(`break ${intent.player} ${intent.block.dimension} ${intent.block.y} ${intent.item?.typeId}`);
            return { veto: true };
        });
        actions.guardItemUse((intent) => {
            seen.push(`use ${intent.player} ${intent.item.typeId}`);
            return { veto: true };
        });

        const breaking = new PlayerBreakBlockEvent(7n, worldOf(level), block, stick);
        kernel.events.post('playerBreakBlock', breaking);
        const using = new PlayerUseItemEvent(7n, worldOf(level), stick);
        kernel.events.post('playerUseItem', using);
        const other = new PlayerUseItemEvent(8n, worldOf(elsewhere), stick);
        kernel.events.post('playerUseItem', other);

        expect([breaking.isCanceled(), using.isCanceled(), other.isCanceled()]).toEqual([true, true, false]);
        expect(seen).toEqual(['break 7 minecraft:overworld -60 minecraft:stick', 'use 7 minecraft:stick']);
    });

    it('reports a break and a use that went on as after-events', () => {
        const kernel = testKernel();
        const actions = levelPlayerActions(stub<Server>({ getKernel: () => kernel }), level);
        const events: ScriptWorldEvent[] = [];
        const stop = actions.events((event) => events.push(event));

        kernel.events.post('playerBlockBroken', new PlayerBlockBrokenEvent(7n, worldOf(level), block, stick, null));
        kernel.events.post('playerItemUsed', new PlayerItemUsedEvent(7n, worldOf(level), stick));
        kernel.events.post('playerItemUsed', new PlayerItemUsedEvent(8n, worldOf(elsewhere), stick));
        stop();
        kernel.events.post('playerItemUsed', new PlayerItemUsedEvent(7n, worldOf(level), stick));

        expect(events).toEqual([
            {
                type: 'playerBreakBlock',
                player: '7',
                block: { dimension: 'minecraft:overworld', x: 1, y: -60, z: 2 },
                brokenBlockPermutation: { typeId: 'minecraft:stone', states: {} },
                itemBefore: { typeId: 'minecraft:stick', amount: 1 }
            },
            { type: 'itemUse', player: '7', item: { typeId: 'minecraft:stick', amount: 1 } }
        ]);
    });

    it('guards a click on a block or an entity, and reports one that did something', () => {
        const kernel = testKernel();
        const actions = levelPlayerActions(stub<Server>({ getKernel: () => kernel }), level);
        const seen: string[] = [];
        actions.guardBlockInteract((intent) => {
            seen.push(
                `block ${intent.player} ${intent.block.y} ${intent.face} ${intent.faceLocation.y} ${intent.item?.typeId}`
            );
            return { veto: intent.item !== undefined };
        });
        actions.guardEntityInteract((intent) => {
            seen.push(`entity ${intent.player} ${intent.target.id} ${intent.target.typeId}`);
            return { veto: true };
        });
        const events: ScriptWorldEvent[] = [];
        actions.events((event) => events.push(event));

        const withStick = new PlayerInteractBlockEvent(
            7n,
            worldOf(level),
            block,
            'up',
            { x: 0.5, y: 1, z: 0.5 },
            stick
        );
        kernel.events.post('playerInteractBlock', withStick);
        const empty = new PlayerInteractBlockEvent(7n, worldOf(level), block, 'north', { x: 0, y: 0.5, z: 0 }, null);
        kernel.events.post('playerInteractBlock', empty);
        const pig = new PlayerInteractEntityEvent(7n, worldOf(level), { runtimeId: 9n, type: 'minecraft:pig' }, stick);
        kernel.events.post('playerInteractEntity', pig);
        const elsewhereClick = new PlayerInteractEntityEvent(
            8n,
            worldOf(elsewhere),
            { runtimeId: 9n, type: 'minecraft:pig' },
            stick
        );
        kernel.events.post('playerInteractEntity', elsewhereClick);
        kernel.events.post('playerBlockInteracted', new PlayerBlockInteractedEvent(empty, stick));
        kernel.events.post('playerEntityInteracted', new PlayerEntityInteractedEvent(pig, null));

        expect([withStick.isCanceled(), empty.isCanceled(), pig.isCanceled(), elsewhereClick.isCanceled()]).toEqual([
            true,
            false,
            true,
            false
        ]);
        expect(seen).toEqual([
            'block 7 -60 Up 1 minecraft:stick',
            'block 7 -60 North 0.5 undefined',
            'entity 7 9 minecraft:pig'
        ]);
        expect(events).toEqual([
            {
                type: 'playerInteractWithBlock',
                player: '7',
                block: { dimension: 'minecraft:overworld', x: 1, y: -60, z: 2 },
                face: 'North',
                faceLocation: { x: 0, y: 0.5, z: 0 },
                itemAfter: { typeId: 'minecraft:stick', amount: 1 }
            },
            {
                type: 'playerInteractWithEntity',
                player: '7',
                target: { id: '9', typeId: 'minecraft:pig' },
                item: { typeId: 'minecraft:stick', amount: 1 }
            }
        ]);
    });
});
