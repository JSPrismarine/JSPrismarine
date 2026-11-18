import { describe, expect, it } from 'vitest';

import type { ScriptWorldEvent } from '@jsprismarine/script-host/host/world';

import PlayerBlockBrokenEvent from '../events/player/PlayerBlockBrokenEvent';
import PlayerBreakBlockEvent from '../events/player/PlayerBreakBlockEvent';
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
});
