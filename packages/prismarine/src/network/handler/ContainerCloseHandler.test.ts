import { describe, expect, it } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import CraftingInput from '../../crafting/CraftingInput';
import ContainerEntry from '../../inventory/ContainerEntry';
import HumanInventory from '../../inventory/HumanInventory';
import { Item } from '../../item/Item';
import { stub } from '../../testing/stub.test.helper';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type ClientConnection from '../ClientConnection';
import type PlayerSession from '../PlayerSession';
import type DataPacket from '../packet/DataPacket';
import ContainerClosePacket from '../packet/ContainerClosePacket';
import ContainerCloseHandler from './ContainerCloseHandler';

const planks = (count: number) => new Item({ id: 5, name: 'minecraft:oak_planks', count });

/** Runs the handler against one close, and reports what it sent and what it dropped. */
const run = async (craftingInput: CraftingInput, inventory: HumanInventory) => {
    const sent: DataPacket[] = [];
    const dropped: string[] = [];

    const world: World = stub<World>({
        dropContents: async (_position, contents) => {
            for (const drop of contents) {
                if (drop instanceof Item) dropped.push(`${drop.getName()} x${drop.getAmount()}`);
            }
        }
    });

    const session = stub<PlayerSession>({
        getConnection: () => stub<ClientConnection>({ sendDataPacket: async (packet) => void sent.push(packet) }),
        getPlayer: () =>
            stub<Player>({
                getInventory: () => inventory,
                getCraftingInput: () => craftingInput,
                getWorld: () => world,
                getPosition: () => new Position(1, 2, 3, world)
            }),
        sendInventory: async () => {}
    });

    const packet = Object.assign(new ContainerClosePacket(), {
        containerId: 3,
        containerType: 0,
        serverInitiatedClose: false
    });

    await new ContainerCloseHandler().handle(packet, stub<Server>({}), session);

    return { sent, dropped };
};

describe('network', () => {
    describe('ContainerCloseHandler', () => {
        it('echoes the close back with the three fields it was sent', async () => {
            const { sent } = await run(new CraftingInput(), new HumanInventory());

            const [reply] = sent;
            expect(reply).toBeInstanceOf(ContainerClosePacket);
            expect(reply).toMatchObject({ containerId: 3, containerType: 0, serverInitiatedClose: false });
        });

        it('gives the crafting grid back to the inventory', async () => {
            const craftingInput = new CraftingInput();
            craftingInput.set(0, planks(4));

            const inventory = new HumanInventory();
            const { dropped } = await run(craftingInput, inventory);

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

            const { dropped } = await run(craftingInput, inventory);

            expect(dropped).toEqual(['minecraft:oak_planks x4']);
            expect(craftingInput.isEmpty()).toBe(true);
        });
    });
});
