import type { Logger } from '@jsprismarine/logger';
import { Gametype } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import HumanInventory from '../../inventory/HumanInventory';
import type PlayerSession from '../../network/PlayerSession';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { stubPlayerPort } from '../../testing/playerPort.test.helper';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type { Intent } from '../Intent';
import SetCreativeSlotHandler from './SetCreativeSlotHandler';

/** A player in `gamemode` with an empty inventory, whose slot resends are recorded. */
const scene = (gamemode: Gametype) => {
    const inventory = new HumanInventory();
    const resent: string[] = [];
    const session = stub<PlayerSession>({
        identity: identityNamed('tester'),
        getPlayer: () => stubPlayerPort({ gamemode, getInventory: () => inventory }),
        sendOwnSlot: async (container, slot) => void resent.push(`${container} ${slot}`)
    });
    const set = async (intent: Omit<Intent<'setCreativeSlot'>, 'kind'>) => {
        const { context, settled } = inputContext(session, { log: stub<Logger>({ verbose: () => {} }) });
        new SetCreativeSlotHandler().handle({ kind: 'setCreativeSlot', ...intent }, context);
        await settled();
    };
    return { inventory, resent, set };
};

const slotOf = (inventory: HumanInventory, slot: number) => {
    const entry = inventory.getEntry(slot);
    return entry === null ? null : `${entry.getItem().getName()} x${entry.getCount()}`;
};

describe('SetCreativeSlotHandler', () => {
    it("puts a creative player's stack where it said, at most a full stack, and empties a slot", async () => {
        const { inventory, set } = scene(Gametype.CREATIVE);

        await set({ container: 'inventory', slot: 2, item: { name: 'minecraft:stone', count: 99 } });
        await set({ container: 'armor', slot: 0, item: { name: 'minecraft:iron_helmet', count: 1 } });
        expect(slotOf(inventory, 2)).toBe('minecraft:stone x64');
        expect(inventory.getArmor().getItem(0).getName()).toBe('minecraft:iron_helmet');

        await set({ container: 'inventory', slot: 2, item: null });
        expect(inventory.getItem(2).getName()).toBe('minecraft:air');
    });

    it('puts back the slot of a player who is not in creative, or who names no item', async () => {
        const survival = scene(Gametype.SURVIVAL);
        await survival.set({ container: 'inventory', slot: 0, item: { name: 'minecraft:diamond', count: 64 } });
        expect(survival.inventory.getItem(0).getName()).toBe('minecraft:air');
        expect(survival.resent).toEqual(['inventory 0']);

        const creative = scene(Gametype.CREATIVE);
        await creative.set({ container: 'offhand', slot: 0, item: { name: 'minecraft:not_an_item', count: 1 } });
        expect(creative.resent).toEqual(['offhand 0']);
    });
});
