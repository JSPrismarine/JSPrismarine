import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it, vi } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import CraftingInput from '../../crafting/CraftingInput';
import ContainerEntry from '../../inventory/ContainerEntry';
import HumanInventory from '../../inventory/HumanInventory';
import { Item } from '../../item/Item';
import type { StubMembers } from '../../testing/stub.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type ClientConnection from '../ClientConnection';
import type PlayerSession from '../PlayerSession';
import type DataPacket from '../packet/DataPacket';
import ContainerClosePacket from '../packet/ContainerClosePacket';
import ContainerCloseHandler from './ContainerCloseHandler';

const planks = (count: number) => new Item({ id: 5, name: 'minecraft:oak_planks', count });

/** What a test may change about the close and the session it lands on. */
interface Scenario {
    craftingInput?: CraftingInput;
    inventory?: HumanInventory;
    /** The window ids the session has open; the handler's close is checked against them. */
    openWindows?: number[];
    /** The three fields the client sent. */
    packet?: StubMembers<ContainerClosePacket>;
}

/** Runs the handler against one close, and reports what it sent, closed, dropped and logged. */
const run = async ({
    craftingInput = new CraftingInput(),
    inventory = new HumanInventory(),
    openWindows = [3],
    packet: fields = {}
}: Scenario = {}) => {
    const sent: DataPacket[] = [];
    const dropped: string[] = [];
    const droppedItems: Item[] = [];
    const closed: number[] = [];
    const windows = new Set(openWindows);
    const debug = vi.fn();

    const world: World = stub<World>({
        dropContents: async (_position, contents) => {
            for (const drop of contents) {
                if (!(drop instanceof Item)) continue;
                dropped.push(`${drop.getName()} x${drop.getAmount()}`);
                droppedItems.push(drop);
            }
        }
    });

    const session = stub<PlayerSession>({
        getConnection: () => stub<ClientConnection>({ sendDataPacket: async (packet) => void sent.push(packet) }),
        getPlayer: () =>
            stub<Player>({
                getName: () => 'Steve',
                getInventory: () => inventory,
                getCraftingInput: () => craftingInput,
                getWorld: () => world,
                getPosition: () => new Position(1, 2, 3, world)
            }),
        closeWindow: (windowId) => {
            if (!windows.delete(windowId)) return false;
            closed.push(windowId);
            return true;
        },
        sendInventory: async () => {}
    });

    const server = stub<Server>({ getLogger: () => stub<Logger>({ debug }) });

    const packet = Object.assign(
        new ContainerClosePacket(),
        { containerId: 3, containerType: 0, serverInitiatedClose: false },
        fields
    );

    await new ContainerCloseHandler().handle(packet, server, session);

    return { sent, dropped, droppedItems, closed, debug };
};

describe('network', () => {
    describe('ContainerCloseHandler', () => {
        it('closes the window on the server and answers with the id and type the client sent', async () => {
            const { sent, closed, debug } = await run();

            expect(closed).toEqual([3]);
            expect(debug).not.toHaveBeenCalled();

            const [reply] = sent;
            expect(reply).toBeInstanceOf(ContainerClosePacket);
            expect(reply).toMatchObject({ containerId: 3, containerType: 0, serverInitiatedClose: false });
        });

        it('answers with Server Initiated Close false even when the client claimed otherwise', async () => {
            const { sent } = await run({ packet: { serverInitiatedClose: true } });

            expect(sent[0]).toMatchObject({ containerId: 3, serverInitiatedClose: false });
        });

        it('logs a close for a window it never opened, and still answers it', async () => {
            const { sent, closed, debug } = await run({ openWindows: [3], packet: { containerId: 9 } });

            expect(closed).toEqual([]);
            expect(debug).toHaveBeenCalledWith(
                'Steve closed container 9, which it did not have open',
                'ContainerCloseHandler/handle'
            );
            expect(sent).toHaveLength(1);
            expect(sent[0]).toMatchObject({ containerId: 9, serverInitiatedClose: false });
        });

        it('gives the crafting grid back to the inventory', async () => {
            const craftingInput = new CraftingInput();
            craftingInput.set(0, planks(4));

            const inventory = new HumanInventory();
            const { dropped } = await run({ craftingInput, inventory });

            expect(craftingInput.isEmpty()).toBe(true);
            expect(inventory.getItem(0).getName()).toBe('minecraft:oak_planks');
            expect(dropped).toEqual([]);
        });

        it('drops what the inventory has no room for rather than eating it', async () => {
            const inventory = new HumanInventory();
            for (let slot = 0; slot < 36; slot++) {
                inventory.setItem(
                    slot,
                    new ContainerEntry({ item: new Item({ id: 1, name: 'minecraft:stone', count: 64 }), count: 64 })
                );
            }

            const craftingInput = new CraftingInput();
            craftingInput.set(0, planks(4));

            const { dropped } = await run({ craftingInput, inventory });

            expect(dropped).toEqual(['minecraft:oak_planks x4']);
            expect(craftingInput.isEmpty()).toBe(true);
        });

        it('drops a copy of what did not fit, name and enchantments included', async () => {
            // Rebuilt from its name, what fell was a plain stack of the same item.
            const inventory = new HumanInventory();
            for (let slot = 0; slot < 36; slot++) {
                inventory.setItem(
                    slot,
                    new ContainerEntry({ item: new Item({ id: 1, name: 'minecraft:stone', count: 64 }), count: 64 })
                );
            }

            const craftingInput = new CraftingInput();
            craftingInput.set(
                0,
                new Item({ name: 'minecraft:oak_planks', count: 4, customName: 'Spare' }).withEnchantments({
                    'minecraft:unbreaking': 1
                })
            );

            const { droppedItems } = await run({ craftingInput, inventory });

            expect(droppedItems.map((item) => item.getCustomName())).toEqual(['Spare']);
            expect(droppedItems[0]?.getEnchantmentLevel('minecraft:unbreaking')).toBe(1);
        });
    });
});
