import { Gametype } from '@jsprismarine/minecraft';
import { AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';
import { describe, expect, it } from 'vitest';

import InventorySlotPacket from '@jsprismarine/protocol/packet/InventorySlotPacket';
import ContainerEntry from '../inventory/ContainerEntry';
import { WindowIds } from '../inventory/WindowIds';
import { Item } from '../item/Item';
import { beginMeasuredTick } from '../testing/changeTicks.test.helper';
import { fakePlayer } from '../testing/fakePlayer.test.helper';

/** The names of the packets a fake player's client was sent, in order. */
const names = (sent: readonly { getName(): string }[]): string[] => sent.map((packet) => packet.getName());

/**
 * The owner's view: a session's writes and the packets to its own client are made before the
 * method returns, so a handler can run it in its input's unit and hand the promise to the step's
 * outputs. Asserted on the order and the count of the packets queued, with nothing awaited.
 */
describe("PlayerSession's sends to its own client", () => {
    it('changes the game mode and queues every packet before setGamemode returns', async () => {
        const { session, player, sent } = fakePlayer();
        player.gamemode = Gametype.SURVIVAL;

        const sends = session.setGamemode(Gametype.CREATIVE);

        expect(player.gamemode).toBe(Gametype.CREATIVE);
        const queued = names(sent);
        expect(queued).toEqual([
            'SetPlayerGameTypePacket',
            'UpdatePlayerGameTypePacket',
            'SetPlayerGameTypePacket',
            'UpdateAdventureSettingsPacket',
            'UpdateAbilitiesPacket',
            'SetPlayerGameTypePacket',
            // No SetActorData: whether the player may fly reaches it, and everyone who sees it,
            // from the logged game mode after the tick seals.
            'UpdateAbilitiesPacket'
        ]);

        // Waiting adds nothing: the promise only says the transport framed what was queued.
        await sends;
        expect(names(sent)).toEqual(queued);
    });

    it('lands a flying player whose new game mode may not fly before setGamemode returns', () => {
        const { session, player, sent } = fakePlayer();
        player.gamemode = Gametype.CREATIVE;
        session.inputs().setPlayerFlying(player, true);

        void session.setGamemode(Gametype.SURVIVAL);

        expect(player.isFlying()).toBe(false);
        expect(names(sent).filter((name) => name === 'UpdateAdventureSettingsPacket')).toHaveLength(2);
    });

    it('queues the whole spawn before completeSpawn returns', async () => {
        const { session, player, sent } = fakePlayer();
        player.attributes.setValue(AttributeIds.Health, 15);

        const sends = session.completeSpawn();

        const queued = names(sent);
        expect(queued).toEqual([
            // setGamemode with the current game mode: its sends, and no mining to stop.
            'SetPlayerGameTypePacket',
            'UpdatePlayerGameTypePacket',
            'SetPlayerGameTypePacket',
            'UpdateAdventureSettingsPacket',
            'UpdateAbilitiesPacket',
            'SetPlayerGameTypePacket',
            'UpdateAbilitiesPacket',
            // sendInventory: the contents, the hand, the armor window, and what the player wears.
            'InventoryContentPacket',
            'MobEquipmentPacket',
            'InventoryContentPacket',
            'MobArmorEquipmentPacket',
            'MobEquipmentPacket',
            // announceSettings, then the state the spawning client threw away.
            'SetPlayerGameTypePacket',
            'UpdateAdventureSettingsPacket',
            'UpdateAbilitiesPacket',
            'UpdateAttributesPacket',
            'SetActorDataPacket'
        ]);
        // The attribute sync is written as sent, before the method returns.
        expect(player.attributes.getDirty()).toEqual([]);

        await sends;
        expect(names(sent)).toEqual(queued);
    });

    it('shows a slot whose write was undone under the new network id of the stack written back', () => {
        const { session, player, live, sent } = fakePlayer();
        const inventory = player.getInventory();
        inventory.setItem(0, new ContainerEntry({ item: new Item({ name: 'minecraft:bread' }), count: 3 }));
        void session.sendInventory();
        const first = inventory.getEntry(0)?.toItemStack().stackNetworkId;
        const store = live.runtime.store;
        beginMeasuredTick(store);

        store.unit(() => {
            inventory.setItem(0, new ContainerEntry({ item: new Item({ name: 'minecraft:stone' }), count: 1 }));
            throw new Error('planned');
        });
        const sealed = store.sealTick();
        sent.length = 0;

        // The log names the slot, and sending it gives the restored stack an id of its own.
        expect(sealed?.entries).toEqual([
            {
                kind: 'occurrence',
                occurrence: 'slot-shown',
                data: { entity: player.getRuntimeId(), container: 'inventory', slot: 0 }
            }
        ]);
        void session.sendOwnSlot('inventory', 0);

        expect(sent).toHaveLength(1);
        const packet = sent[0];
        if (!(packet instanceof InventorySlotPacket)) throw new Error('expected InventorySlotPacket');
        expect(packet.windowId).toBe(WindowIds.INVENTORY);
        expect(packet.inventorySlot).toBe(0);
        expect(packet.item?.stackSize).toBe(3);
        expect(packet.item?.stackNetId).toBeGreaterThan(0);
        expect(packet.item?.stackNetId).not.toBe(first);
    });

    it('sends nothing for a container the client has no window for', () => {
        const { session, sent } = fakePlayer();

        void session.sendOwnSlot('crafting', 1);
        void session.sendOwnSlot('ender_chest', 0);
        void session.sendOwnSlot('inventory', 999);

        expect(sent).toHaveLength(0);
    });
});
