import { Gametype } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import HumanInventory from '../../inventory/HumanInventory';
import { Item } from '../../item/Item';
import type PlayerSession from '../../player/PlayerSession';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { stubPlayerPort } from '../../testing/playerPort.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type { World } from '../../world/World';
import DropHeldItemHandler from './DropHeldItemHandler';

/** A player in `gamemode` holding 5 cobblestone in hotbar slot 2, whose drops and slot resends are recorded. */
const scene = (gamemode: Gametype) => {
    const inventory = new HumanInventory();
    inventory.setHandSlot(2);
    inventory.container('inventory').set(2, new Item({ runtimeId: 4, name: 'minecraft:cobblestone', count: 5 }));
    const dropped: string[] = [];
    const resent: string[] = [];
    const world = stub<World>({
        dropFromPlayer: async (_player, contents, dropper) => {
            for (const drop of contents) {
                if (drop instanceof Item) dropped.push(`${drop.getName()} x${drop.getAmount()} by ${dropper}`);
            }
        }
    });
    const session = stub<PlayerSession>({
        runtimeId: 7n,
        getWorld: () => world,
        getPlayer: () => stubPlayerPort({ gamemode, getInventory: () => inventory }),
        sendOwnSlot: async (container, slot) => void resent.push(`${container} ${slot}`)
    });
    const drop = async (all: boolean) => {
        const { context, settled } = inputContext(session);
        new DropHeldItemHandler().handle({ kind: 'dropHeldItem', all }, context);
        await settled();
    };
    const held = () => inventory.container('inventory').get(2)?.getAmount() ?? 0;
    return { drop, dropped, resent, held };
};

describe('DropHeldItemHandler', () => {
    it('drops one item of the held stack, then the rest of it', async () => {
        const { drop, dropped, resent, held } = scene(Gametype.SURVIVAL);

        await drop(false);
        expect(held()).toBe(4);
        await drop(true);
        expect(held()).toBe(0);

        expect(dropped).toEqual(['minecraft:cobblestone x1 by 7', 'minecraft:cobblestone x4 by 7']);
        expect(resent).toEqual(['inventory 2', 'inventory 2']);
    });

    it('drops nothing for a spectator, nor from an empty hand', async () => {
        const spectator = scene(Gametype.SPECTATOR);
        await spectator.drop(true);
        expect(spectator.held()).toBe(5);
        expect(spectator.dropped).toEqual([]);

        const emptied = scene(Gametype.SURVIVAL);
        await emptied.drop(true);
        await emptied.drop(false);
        expect(emptied.dropped).toEqual(['minecraft:cobblestone x5 by 7']);
    });
});
