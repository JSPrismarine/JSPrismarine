import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it, vi } from 'vitest';

import CraftingInput from '../../crafting/CraftingInput';
import ContainerEntry from '../../inventory/ContainerEntry';
import HumanInventory from '../../inventory/HumanInventory';
import { WindowTypes } from '../../inventory/WindowTypes';
import { Item } from '../../item/Item';
import type { StubMembers } from '../../testing/stub.test.helper';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type ClientConnection from '../ClientConnection';
import type PlayerSession from '../PlayerSession';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import ContainerClosePacket from '@jsprismarine/protocol/packet/ContainerClosePacket';
import ContainerCloseHandler from './ContainerCloseHandler';
import { stubPlayerPort } from '../../testing/playerPort.test.helper';

const planks = (count: number) => new Item({ runtimeId: 5, name: 'minecraft:oak_planks', count });

/** What a test may change about the close and the session it lands on. */
interface Scenario {
    craftingInput?: CraftingInput;
    inventory?: HumanInventory;
    /** The window ids the session has open; the handler's close is checked against them. */
    openWindows?: number[];
    /** What the open window kept in its own slots, such as a trade screen's payment. */
    windowItems?: Item[];
    /** The three fields the client sent. */
    packet?: StubMembers<ContainerClosePacket>;
}

/** Runs the handler against one close, and reports what it sent, closed, dropped and logged. */
const run = async ({
    craftingInput = new CraftingInput(),
    inventory = new HumanInventory(),
    openWindows = [3],
    windowItems = [],
    packet: fields = {}
}: Scenario = {}) => {
    const sent: NetworkPacket[] = [];
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
        identity: identityNamed('Steve'),
        getConnection: () => stub<ClientConnection>({ sendDataPacket: async (packet) => void sent.push(packet) }),
        getWorld: () => world,
        getPlayer: () =>
            stubPlayerPort({
                getInventory: () => inventory,
                getCraftingInput: () => craftingInput,
                getPosition: () => new Position(1, 2, 3, world)
            }),
        getOpenBlockContainer: () =>
            windowItems.length === 0
                ? undefined
                : {
                      windowId: 3,
                      position: new Position(0, 0, 0, world),
                      identifier: 'minecraft:villager_v2',
                      screen: WindowTypes.TRADE,
                      inputs: windowItems,
                      bookshelfPower: 0
                  },
        closeWindow: (windowId) => {
            if (!windows.delete(windowId)) return false;
            closed.push(windowId);
            return true;
        },
        sendInventory: async () => {}
    });

    const packet = Object.assign(
        new ContainerClosePacket(),
        { containerId: 3, containerType: 0, serverInitiatedClose: false },
        fields
    );

    const { context, settled } = inputContext(session, { log: stub<Logger>({ debug }) });
    new ContainerCloseHandler().handle(packet, context);
    // What the handler wrote, before the step waits for its sends.
    const droppedInHandler = [...dropped];
    const emptiedInHandler = craftingInput.isEmpty();
    await settled();

    return { sent, dropped, droppedItems, closed, debug, droppedInHandler, emptiedInHandler };
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

        it('gives back what the closed window kept in its own slots', async () => {
            const emerald = new Item({ runtimeId: 6, name: 'minecraft:emerald', count: 3 });
            const inventory = new HumanInventory();
            const { dropped } = await run({ inventory, windowItems: [emerald] });

            expect(inventory.getItem(0).getName()).toBe('minecraft:emerald');
            expect(inventory.getItem(0).getAmount()).toBe(3);
            expect(dropped).toEqual([]);
        });

        it('gives back the cursor of a player who closes a window over it', async () => {
            const inventory = new HumanInventory();
            inventory.setCursor(new Item({ runtimeId: 6, name: 'minecraft:emerald', count: 1 }));
            await run({ inventory, windowItems: [new Item({ runtimeId: 6, name: 'minecraft:emerald', count: 2 })] });

            expect(inventory.getCursor()).toBeNull();
            expect(inventory.getItem(0).getAmount()).toBe(3);
        });

        it('drops what the inventory has no room for rather than eating it', async () => {
            const inventory = new HumanInventory();
            for (let slot = 0; slot < 36; slot++) {
                inventory.setItem(
                    slot,
                    new ContainerEntry({
                        item: new Item({ runtimeId: 1, name: 'minecraft:stone', count: 64 }),
                        count: 64
                    })
                );
            }

            const craftingInput = new CraftingInput();
            craftingInput.set(0, planks(4));

            const { dropped, droppedInHandler, emptiedInHandler } = await run({ craftingInput, inventory });

            expect(dropped).toEqual(['minecraft:oak_planks x4']);
            expect(craftingInput.isEmpty()).toBe(true);
            // Inside the handler's unit, so a throw would undo them, and not after the reply.
            expect(droppedInHandler).toEqual(dropped);
            expect(emptiedInHandler).toBe(true);
        });

        it('drops a copy of what did not fit, name and enchantments included', async () => {
            // Rebuilt from its name, what fell was a plain stack of the same item.
            const inventory = new HumanInventory();
            for (let slot = 0; slot < 36; slot++) {
                inventory.setItem(
                    slot,
                    new ContainerEntry({
                        item: new Item({ runtimeId: 1, name: 'minecraft:stone', count: 64 }),
                        count: 64
                    })
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
