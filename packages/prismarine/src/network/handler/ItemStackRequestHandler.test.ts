import { describe, expect, it } from 'vitest';

import ContainerEntry from '../../inventory/ContainerEntry';
import CraftingInput from '../../crafting/CraftingInput';
import { StationRegistry } from '../../crafting/CraftingStation';
import { ShapelessRecipe } from '../../crafting/Recipe';
import RecipeManager from '../../crafting/RecipeManager';
import { ItemIngredient } from '../../crafting/RecipeIngredient';
import CreativeInventory from '../../inventory/CreativeInventory';
import HumanInventory from '../../inventory/HumanInventory';
import { Item } from '../../item/Item';
import ItemStackResponsePacket, { ItemStackResponseResult } from '../packet/ItemStackResponsePacket';
import type { ItemStackRequest, ItemStackRequestSlotInfo } from '../type/ItemStackRequest';
import { ContainerUiId, ItemStackRequestActionType } from '../type/ItemStackRequest';
import ItemStackRequestHandler from './ItemStackRequestHandler';

/**
 * A slot of the inventory's own two by two grid, as the client numbers it.
 *
 * Not from zero: the four are 28 to 31 and a table's nine are 32 to 40. This took an index
 * and passed it straight through, so every crafting test ran against slot numbers no client
 * has ever sent - and the handler, which rejected anything above eight, looked correct while
 * refusing every real request.
 * @see https://github.com/pmmp/BedrockProtocol/blob/35.0.0%2Bbedrock-1.21.40/src/types/inventory/UIInventorySlotOffset.php
 */
const craftSlot = (index: number): ItemStackRequestSlotInfo => ({
    container: { containerId: ContainerUiId.CRAFTING_INPUT, dynamicId: null },
    slotId: 28 + index,
    stackNetId: 0
});

/** The same, for a crafting table's three by three. */
const tableSlot = (index: number): ItemStackRequestSlotInfo => ({
    container: { containerId: ContainerUiId.CRAFTING_INPUT, dynamicId: null },
    slotId: 32 + index,
    stackNetId: 0
});

const slot = (slotId: number, containerId = ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY): ItemStackRequestSlotInfo => ({
    container: { containerId, dynamicId: null },
    slotId,
    stackNetId: 0
});

/** A server whose creative menu is one known item, so a pick can be checked by name. */
const fakeServer = (creative: Item[]) => {
    CreativeInventory.reset();
    (CreativeInventory as any).items = creative;

    // A refusal says why it refused, and says it through the logger.
    return { getLogger: () => ({ debug: () => {} }) } as any;
};

const run = async (
    requests: ItemStackRequest[],
    inventory: HumanInventory,
    server: any,
    craftingInput = new CraftingInput()
) => {
    const sent: any[] = [];
    const craftingSlots: Array<{ slot: number; item: string }> = [];
    const session = {
        getPlayer: () => ({ getInventory: () => inventory, getCraftingInput: () => craftingInput }),
        send: async (packet: any) => void sent.push(packet),
        // The grid lives in the player's UI window, and an `ItemStackResponse` can only answer
        // about slots the request named - a craft names none of them.
        sendCraftingSlot: async (slot: number, item: any) =>
            void craftingSlots.push({ slot, item: item?.getName() ?? 'air' })
    } as any;

    await new ItemStackRequestHandler().handle({ requests } as any, server, session);

    const response = sent.find((pk) => pk instanceof ItemStackResponsePacket)!;
    response.craftingSlots = craftingSlots;

    return response;
};

describe('network', () => {
    describe('ItemStackRequestHandler', () => {
        it('puts a creative pick in the slot it was dropped on', async () => {
            const server = fakeServer([new Item({ id: 5, name: 'minecraft:oak_planks' })]);
            const inventory = new HumanInventory();

            const response = await run(
                [
                    {
                        requestId: 7,
                        actions: [
                            { type: ItemStackRequestActionType.CREATIVE_CREATE, creativeItemNetId: 1, repetitions: 1 },
                            {
                                type: ItemStackRequestActionType.PLACE,
                                count: 64,
                                source: slot(0, 99),
                                destination: slot(3)
                            }
                        ],
                        filterStrings: [],
                        filterStringCause: 0
                    }
                ],
                inventory,
                server
            );

            expect(inventory.getItem(3).getName()).toBe('minecraft:oak_planks');
            expect(inventory.getItem(3).getAmount()).toBe(64);

            // Answered, and answered about the slot that changed - the client holds its own
            // change back until it hears this.
            expect(response.responses[0].result).toBe(ItemStackResponseResult.OK);
            expect(response.responses[0].requestId).toBe(7);
            expect(response.responses[0].containers[0].slots.map((s: any) => s.slot)).toEqual([3]);
        });

        it('does not hand the same object to two players', async () => {
            // The creative list is one set of items shared by everyone; putting one of them
            // straight into an inventory would give every player the same object to mutate.
            const shared = new Item({ id: 5, name: 'minecraft:oak_planks' });
            const server = fakeServer([shared]);

            const pick = (inventory: HumanInventory) =>
                run(
                    [
                        {
                            requestId: 1,
                            actions: [
                                {
                                    type: ItemStackRequestActionType.CREATIVE_CREATE,
                                    creativeItemNetId: 1,
                                    repetitions: 1
                                },
                                {
                                    type: ItemStackRequestActionType.PLACE,
                                    count: 12,
                                    source: slot(0, 99),
                                    destination: slot(0)
                                }
                            ],
                            filterStrings: [],
                            filterStringCause: 0
                        }
                    ],
                    inventory,
                    server
                );

            const first = new HumanInventory();
            const second = new HumanInventory();
            await pick(first);
            await pick(second);

            expect(first.getItem(0)).not.toBe(second.getItem(0));
            expect(shared.getAmount()).toBe(1);
        });

        it('moves a stack between slots', async () => {
            const server = fakeServer([]);
            const inventory = new HumanInventory();
            inventory.setItem(0, new ContainerEntry({ item: new Item({ id: 1, name: 'minecraft:stone' }) }));

            await run(
                [
                    {
                        requestId: 2,
                        actions: [
                            {
                                type: ItemStackRequestActionType.PLACE,
                                count: 1,
                                source: slot(0),
                                destination: slot(5)
                            }
                        ],
                        filterStrings: [],
                        filterStringCause: 0
                    }
                ],
                inventory,
                server
            );

            expect(inventory.getItem(5).getName()).toBe('minecraft:stone');
            expect(inventory.getItem(0).getName()).toBe('minecraft:air');
        });

        it('reads a crafting table through its own slot numbers', async () => {
            // The same grid store, addressed from 32 rather than from 28. Both were rejected
            // outright before, so neither size of grid could craft anything.
            const craftingInput = new CraftingInput();
            const located = CraftingInput.locate(32)!;
            craftingInput.useGrid(located.size);

            expect(located.index).toBe(0);
            expect(craftingInput.gridSize()).toBe(CraftingInput.LARGE);
            expect(craftingInput.wireSlotOf(0)).toBe(tableSlot(0).slotId);
        });

        it('undoes everything when a later step fails', async () => {
            // A request is all or nothing. Its steps used to be applied as they were read and
            // a refusal simply returned, so a request that failed on its last action kept what
            // the earlier ones had done - while the client, told only that the whole request
            // failed, put all of it back. A plank left in the crafting grid on the server and
            // not on the screen then made every later craft match a grid nobody could see.
            const server = fakeServer([]);
            (server as any).getRecipeManager = () => ({ getByNetId: () => null });

            const inventory = new HumanInventory();
            inventory.setItem(0, new ContainerEntry({ item: new Item({ id: 1, name: 'minecraft:oak_planks' }) }));
            const craftingInput = new CraftingInput();

            const response = await run(
                [
                    {
                        requestId: 5,
                        actions: [
                            // This one would work...
                            {
                                type: ItemStackRequestActionType.PLACE,
                                count: 1,
                                source: slot(0),
                                destination: craftSlot(0)
                            },
                            // ...and this one cannot.
                            { type: ItemStackRequestActionType.CRAFTING_RECIPE, recipeNetId: 999_999, repetitions: 1 }
                        ],
                        filterStrings: [],
                        filterStringCause: 0
                    }
                ],
                inventory,
                server,
                craftingInput
            );

            expect(response.responses[0].result).toBe(ItemStackResponseResult.ERROR);
            expect(craftingInput.isEmpty()).toBe(true);
            expect(inventory.getItem(0).getName()).toBe('minecraft:oak_planks');
        });

        it('refuses what it cannot do, instead of leaving the client waiting', async () => {
            // Silence is what stops a client committing anything at all; a refusal at least
            // tells it to put back what it had.
            const server = fakeServer([]);

            const response = await run(
                [
                    {
                        requestId: 4,
                        actions: [{ type: ItemStackRequestActionType.CRAFTING_LOOM }],
                        filterStrings: [],
                        filterStringCause: 0
                    }
                ],
                new HumanInventory(),
                server
            );

            expect(response.responses[0].result).toBe(ItemStackResponseResult.ERROR);
            expect(response.responses[0].requestId).toBe(4);
            expect(response.responses[0].containers).toHaveLength(0);
        });

        it('refuses a slot outside the inventory', async () => {
            const server = fakeServer([]);

            const response = await run(
                [
                    {
                        requestId: 5,
                        actions: [
                            {
                                type: ItemStackRequestActionType.PLACE,
                                count: 1,
                                source: slot(0),
                                destination: slot(200)
                            }
                        ],
                        filterStrings: [],
                        filterStringCause: 0
                    }
                ],
                new HumanInventory(),
                server
            );

            expect(response.responses[0].result).toBe(ItemStackResponseResult.ERROR);
        });

        it('crafts what the grid actually holds', async () => {
            // The whole chain: a recipe registered, a grid filled, the client naming the
            // recipe by number, and the output landing in the inventory.
            const planks = () => new Item({ id: 1, name: 'minecraft:oak_planks' });
            const recipe = new ShapelessRecipe(
                'sticks',
                'crafting_table',
                [new ItemIngredient('minecraft:oak_planks'), new ItemIngredient('minecraft:oak_planks')],
                [new Item({ id: 2, name: 'minecraft:stick' })]
            );

            const manager = new RecipeManager({ getLogger: () => ({ debug: () => {} }), emit: async () => {} } as any);
            await manager.registerRecipe(recipe);
            const registry = new StationRegistry();
            const server = {
                getRecipeManager: () => manager,
                getStationRegistry: () => registry,
                getLogger: () => ({ debug: () => {} })
            } as any;
            registry.registerRecipeStations(server);

            const craftingInput = new CraftingInput();
            craftingInput.set(0, planks());
            craftingInput.set(1, planks());

            const inventory = new HumanInventory();
            const response = await run(
                [
                    {
                        requestId: 3,
                        actions: [
                            { type: ItemStackRequestActionType.CRAFTING_RECIPE, recipeNetId: 1, repetitions: 1 },
                            { type: ItemStackRequestActionType.CRAFTING_CONSUME_INPUT, count: 1, source: craftSlot(0) },
                            { type: ItemStackRequestActionType.CRAFTING_CONSUME_INPUT, count: 1, source: craftSlot(1) },
                            {
                                type: ItemStackRequestActionType.PLACE,
                                count: 1,
                                source: craftSlot(0),
                                destination: slot(0)
                            }
                        ],
                        filterStrings: [],
                        filterStringCause: 0
                    }
                ],
                inventory,
                server,
                craftingInput
            );

            expect(response.responses[0].result).toBe(ItemStackResponseResult.OK);
            expect(inventory.getItem(0).getName()).toBe('minecraft:stick');
            // Spent, and the client told so - otherwise it keeps showing what it used up.
            expect(craftingInput.isEmpty()).toBe(true);
        });

        it('refuses a recipe the grid does not actually hold', async () => {
            // Believing the client's number would let a player craft anything by naming it.
            const recipe = new ShapelessRecipe(
                'sticks',
                'crafting_table',
                [new ItemIngredient('minecraft:oak_planks')],
                [new Item({ id: 2, name: 'minecraft:stick' })]
            );

            const manager = new RecipeManager({ getLogger: () => ({ debug: () => {} }), emit: async () => {} } as any);
            await manager.registerRecipe(recipe);
            const registry = new StationRegistry();
            const server = {
                getRecipeManager: () => manager,
                getStationRegistry: () => registry,
                getLogger: () => ({ debug: () => {} })
            } as any;
            registry.registerRecipeStations(server);

            const empty = new CraftingInput();
            const response = await run(
                [
                    {
                        requestId: 4,
                        actions: [{ type: ItemStackRequestActionType.CRAFTING_RECIPE, recipeNetId: 1, repetitions: 1 }],
                        filterStrings: [],
                        filterStringCause: 0
                    }
                ],
                new HumanInventory(),
                server,
                empty
            );

            expect(response.responses[0].result).toBe(ItemStackResponseResult.ERROR);
        });

        it('moves a stack into the crafting grid, which is how anything gets made', async () => {
            const craftingInput = new CraftingInput();
            const inventory = new HumanInventory();
            inventory.setItem(0, new ContainerEntry({ item: new Item({ id: 1, name: 'minecraft:oak_planks' }) }));

            await run(
                [
                    {
                        requestId: 5,
                        actions: [
                            {
                                type: ItemStackRequestActionType.PLACE,
                                count: 1,
                                source: slot(0),
                                destination: craftSlot(2)
                            }
                        ],
                        filterStrings: [],
                        filterStringCause: 0
                    }
                ],
                inventory,
                fakeServer([]),
                craftingInput
            );

            expect(craftingInput.get(2)?.getName()).toBe('minecraft:oak_planks');
            expect(inventory.getItem(0).getName()).toBe('minecraft:air');
        });

        it('encodes the response it produces', async () => {
            const server = fakeServer([new Item({ id: 5, name: 'minecraft:oak_planks' })]);

            const response = await run(
                [
                    {
                        requestId: 1,
                        actions: [
                            { type: ItemStackRequestActionType.CREATIVE_CREATE, creativeItemNetId: 1, repetitions: 1 },
                            {
                                type: ItemStackRequestActionType.PLACE,
                                count: 1,
                                source: slot(0, 99),
                                destination: slot(0)
                            }
                        ],
                        filterStrings: [],
                        filterStringCause: 0
                    }
                ],
                new HumanInventory(),
                server
            );

            expect(() => response.encode()).not.toThrow();
            expect(response.getBuffer().byteLength).toBeGreaterThan(0);
        });
    });
});
