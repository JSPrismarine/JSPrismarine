import type { Logger } from '@jsprismarine/logger';
import { vanillaBlockPalette } from '@jsprismarine/blocks';
import { item_table as ItemTable, item_tags as ItemTags } from '@jsprismarine/bedrock-data';
import { vanillaItemDefinitions } from '@jsprismarine/items';
import { describe, expect, it } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import { definitionOf, definitionsOf } from '../../content/ContentOptions';
import { buildServerContent } from '../../content/ServerContent';
import { fixtureBlockPalette, fixtureContentOptions, fixtureDefinitions } from '../../content/testing';
import ContainerEntry from '../../inventory/ContainerEntry';
import CraftingInput from '../../crafting/CraftingInput';
import { StationRegistry } from '../../crafting/CraftingStation';
import { ShapelessRecipe } from '../../crafting/Recipe';
import RecipeManager from '../../crafting/RecipeManager';
import { ItemIngredient } from '../../crafting/RecipeIngredient';
import VanillaRecipes from '../../crafting/VanillaRecipes';
import type CreativeInventory from '../../inventory/CreativeInventory';
import HumanInventory from '../../inventory/HumanInventory';
import { Item } from '../../item/Item';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import type { OpenBlockContainer } from '../PlayerSession';
import type { World } from '../../world/World';
import { Position } from '../../world/Position';
import { joinContentPayloads } from '../contentPayloads';
import type DataPacket from '../packet/DataPacket';
import ItemStackRequestPacket from '../packet/ItemStackRequestPacket';
import ItemStackResponsePacket, { ItemStackResponseResult } from '../packet/ItemStackResponsePacket';
import type { ItemStackRequest, ItemStackRequestSlotInfo } from '../type/ItemStackRequest';
import { ContainerUiId, ItemStackRequestActionType } from '../type/ItemStackRequest';
import ItemStackRequestHandler from './ItemStackRequestHandler';
import { testContent } from '../../testing/entityServer';

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

/** Where a craft or a creative pick puts what it made, before a step moves it; the client numbers it 50. */
const createdOutput: ItemStackRequestSlotInfo = {
    container: { containerId: ContainerUiId.CREATED_OUTPUT, dynamicId: null },
    slotId: 50,
    stackNetId: 0
};

const slot = (slotId: number, containerId = ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY): ItemStackRequestSlotInfo => ({
    container: { containerId, dynamicId: null },
    slotId,
    stackNetId: 0
});

/**
 * A server whose creative menu is the items given, so a pick can be checked by name.
 *
 * The menu is a double rather than the real one built over a stub registry: what is under
 * test is which list a pick is read against, and the vanilla list is 1980 entries of
 * irrelevance.
 */
const fakeServer = (creative: Item[], overrides: Partial<Server> = {}) => {
    const entries = creative.map((item) => ({ item, group: 0 }));
    const menu = stub<CreativeInventory>({
        getEntries: () => entries,
        getItems: () => creative,
        get: (netId: number) => entries[netId - 1]?.item ?? null
    });

    // A refusal says why it refused, and says it through the logger.
    return stub<Server>({
        getLogger: () => stub<Logger>({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
        getContent: () => testContent(),
        getCreativeInventory: () => menu,
        ...overrides
    });
};

const run = async (
    requests: ItemStackRequest[],
    inventory: HumanInventory,
    server: Server,
    craftingInput = new CraftingInput(),
    options: { open?: OpenBlockContainer; player?: Player } = {}
) => {
    const sent: DataPacket[] = [];
    const session = stub<PlayerSession>({
        getOpenBlockContainer: () => options.open,
        getPlayer: () =>
            options.player ??
            stub<Player>({
                getInventory: () => inventory,
                getCraftingInput: () => craftingInput,
                // A finished craft raises `recipe_crafted`, which asks the
                // server whether any content is loaded. These doubles load none.
                getServer: () => server
            }),
        send: async (packet) => void sent.push(packet)
    });

    await new ItemStackRequestHandler().handle(
        Object.assign(new ItemStackRequestPacket(), { requests }),
        server,
        session
    );

    const response = sent.find((pk): pk is ItemStackResponsePacket => pk instanceof ItemStackResponsePacket);
    if (!response) throw new Error('no ItemStackResponsePacket was sent');

    return response;
};

describe('network', () => {
    describe('ItemStackRequestHandler', () => {
        it('puts a creative pick in the slot it was dropped on', async () => {
            const server = fakeServer([new Item({ runtimeId: 5, name: 'minecraft:oak_planks' })]);
            const inventory = new HumanInventory();

            const response = await run(
                [
                    {
                        requestId: -7,
                        actions: [
                            { type: ItemStackRequestActionType.CREATIVE_CREATE, creativeItemNetId: 1, repetitions: 1 },
                            {
                                type: ItemStackRequestActionType.PLACE,
                                count: 64,
                                source: slot(0, ContainerUiId.CREATED_OUTPUT),
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
            expect(response.responses[0]?.result).toBe(ItemStackResponseResult.OK);
            expect(response.responses[0]?.requestId).toBe(-7);
            expect(response.responses[0]?.containers[0]?.slots.map((s) => s.slot)).toEqual([3]);
        });

        it('drops the requested stack into the world', async () => {
            const inventory = new HumanInventory();
            inventory.setItem(
                0,
                new ContainerEntry({ item: new Item({ name: 'minecraft:stone', count: 3 }), count: 3 })
            );
            const dropped: Item[] = [];
            const world = stub<World>({
                dropFromPlayer: async (_player, contents) => {
                    for (const content of contents) if (content instanceof Item) dropped.push(content);
                }
            });
            const server = fakeServer([]);
            const player = stub<Player>({
                getInventory: () => inventory,
                getCraftingInput: () => new CraftingInput(),
                getServer: () => server,
                getWorld: () => world,
                getPosition: () => new Position(0, 64, 0, world)
            });

            const response = await run(
                [
                    {
                        requestId: -3,
                        actions: [{ type: ItemStackRequestActionType.DROP, count: 1, source: slot(0) }],
                        filterStrings: [],
                        filterStringCause: 0
                    }
                ],
                inventory,
                server,
                new CraftingInput(),
                { player }
            );

            expect(response.responses[0]?.result).toBe(ItemStackResponseResult.OK);
            expect(inventory.getItem(0).getAmount()).toBe(2);
            expect(dropped.map((item) => [item.getName(), item.getAmount()])).toEqual([['minecraft:stone', 1]]);
        });

        it('does not spawn a drop when a later action refuses the request', async () => {
            const inventory = new HumanInventory();
            inventory.setItem(
                0,
                new ContainerEntry({ item: new Item({ name: 'minecraft:stone', count: 3 }), count: 3 })
            );
            const dropped: Item[] = [];
            const world = stub<World>({
                dropFromPlayer: async (_player, contents) => {
                    for (const content of contents) if (content instanceof Item) dropped.push(content);
                }
            });
            const server = fakeServer([]);
            const player = stub<Player>({
                getInventory: () => inventory,
                getCraftingInput: () => new CraftingInput(),
                getServer: () => server,
                getWorld: () => world,
                getPosition: () => new Position(0, 64, 0, world)
            });

            const response = await run(
                [
                    {
                        requestId: -3,
                        actions: [
                            { type: ItemStackRequestActionType.DROP, count: 1, source: slot(0) },
                            { type: ItemStackRequestActionType.CRAFTING_LOOM }
                        ],
                        filterStrings: [],
                        filterStringCause: 0
                    }
                ],
                inventory,
                server,
                new CraftingInput(),
                { player }
            );

            expect(response.responses[0]?.result).toBe(ItemStackResponseResult.ERROR);
            expect(inventory.getItem(0).getAmount()).toBe(3);
            expect(dropped).toEqual([]);
        });

        it('reads a creative pick off the menu the content build sent', async () => {
            // The client answers with a position in the list it was shown, so
            // a server whose menu came from the registries has to read that
            // one. Here the two disagree on purpose: the captured menu's
            // first entry is a plank and the content build's is not.
            const content = buildServerContent(fixtureContentOptions());
            const payloads = joinContentPayloads(
                content,
                stub<Logger>({ info: () => {}, warn: () => {}, error: () => {} }),
                { clientPalette: fixtureBlockPalette() }
            );
            const expected = payloads?.creativeItems[0]?.name;
            expect(expected).toBeDefined();
            expect(expected).not.toBe('minecraft:oak_planks');

            const server = fakeServer([new Item({ runtimeId: 5, name: 'minecraft:oak_planks' })], {
                getContent: () => content
            });
            const inventory = new HumanInventory();

            await run(
                [
                    {
                        requestId: -7,
                        actions: [
                            { type: ItemStackRequestActionType.CREATIVE_CREATE, creativeItemNetId: 1, repetitions: 1 },
                            {
                                type: ItemStackRequestActionType.PLACE,
                                count: 1,
                                source: slot(0, ContainerUiId.CREATED_OUTPUT),
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

            expect(inventory.getItem(3).getName()).toBe(expected);
        });

        it('does not hand the same object to two players', async () => {
            // The creative list is one set of items shared by everyone; putting one of them
            // straight into an inventory would give every player the same object to mutate.
            const shared = new Item({ runtimeId: 5, name: 'minecraft:oak_planks' });
            const server = fakeServer([shared]);

            const pick = (inventory: HumanInventory) =>
                run(
                    [
                        {
                            requestId: -1,
                            actions: [
                                {
                                    type: ItemStackRequestActionType.CREATIVE_CREATE,
                                    creativeItemNetId: 1,
                                    repetitions: 1
                                },
                                {
                                    type: ItemStackRequestActionType.PLACE,
                                    count: 12,
                                    source: slot(0, ContainerUiId.CREATED_OUTPUT),
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
            inventory.setItem(0, new ContainerEntry({ item: new Item({ runtimeId: 1, name: 'minecraft:stone' }) }));

            await run(
                [
                    {
                        requestId: -3,
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

        it('keeps what a stack carries when part of it moves and when it merges', async () => {
            // Each part was rebuilt from the name, so a split or merged stack lost its
            // enchantments, its name and the content it reads its components from.
            const server = fakeServer([]);
            const inventory = new HumanInventory();
            const rock = new Item({ name: 'minecraft:stone', count: 10, customName: 'Rock', content: testContent() });
            inventory.setItem(0, new ContainerEntry({ item: rock, count: 10 }));

            const move = (count: number) => ({
                requestId: -3,
                actions: [{ type: ItemStackRequestActionType.PLACE, count, source: slot(0), destination: slot(5) }],
                filterStrings: [],
                filterStringCause: 0
            });

            await run([move(4)], inventory, server);

            expect(inventory.getItem(5).getAmount()).toBe(4);
            expect(inventory.getItem(5).getCustomName()).toBe('Rock');
            expect(inventory.getItem(0).getAmount()).toBe(6);
            expect(inventory.getItem(0).getCustomName()).toBe('Rock');

            await run([move(2)], inventory, server);

            expect(inventory.getItem(5).getAmount()).toBe(6);
            expect(inventory.getItem(5).getCustomName()).toBe('Rock');
        });

        it('hands out a creative pick that reads its tags', async () => {
            // Built without the server's content, a picked pickaxe matched no
            // `#minecraft:mineable/pickaxe` rule: it did not harvest stone, and the crack
            // animation ran at a fist's pace.
            const server = fakeServer([new Item({ name: 'minecraft:diamond_pickaxe' })]);
            const inventory = new HumanInventory();

            await run(
                [
                    {
                        requestId: -7,
                        actions: [
                            { type: ItemStackRequestActionType.CREATIVE_CREATE, creativeItemNetId: 1, repetitions: 1 },
                            {
                                type: ItemStackRequestActionType.PLACE,
                                count: 1,
                                source: slot(0, ContainerUiId.CREATED_OUTPUT),
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

            expect(inventory.getItem(3).getName()).toBe('minecraft:diamond_pickaxe');
            expect(inventory.getItem(3).harvests('minecraft:stone')).toBe(true);
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

        it('crafts a recipe by the net id sent in the content recipe packet', async () => {
            const content = buildServerContent(
                fixtureContentOptions({
                    load: () => ({
                        definitions: definitionsOf({
                            ...fixtureDefinitions(),
                            recipesJava: new Map([
                                [
                                    'minecraft:redstone_lamp_from_stone',
                                    definitionOf('recipesJava', 'minecraft:redstone_lamp_from_stone', {
                                        type: 'minecraft:crafting_shapeless',
                                        ingredients: ['minecraft:stone'],
                                        result: { id: 'minecraft:redstone_lamp' }
                                    })
                                ]
                            ])
                        }),
                        diagnostics: []
                    })
                })
            );
            const server = fakeServer([], {
                getContent: () => content,
                getRecipeManager: () => stub<RecipeManager>({ getByNetId: () => null })
            });
            const payloads = joinContentPayloads(content, server.getLogger(), {
                clientPalette: fixtureBlockPalette()
            });
            const recipe = payloads?.crafting.shapeless.find(({ id }) => id === 'minecraft:redstone_lamp_from_stone');
            if (recipe === undefined) throw new Error('the redstone lamp recipe was not advertised');
            const output = recipe.outputs[0];
            if (output === undefined) throw new Error('the redstone lamp recipe has no output');

            const inventory = new HumanInventory();
            const craftingInput = new CraftingInput();
            craftingInput.set(0, new Item({ name: 'minecraft:stone' }));

            const response = await run(
                [
                    {
                        requestId: -3,
                        actions: [
                            {
                                type: ItemStackRequestActionType.CRAFTING_RECIPE,
                                recipeNetId: recipe.netId,
                                repetitions: 1
                            },
                            {
                                type: ItemStackRequestActionType.PLACE,
                                count: 1,
                                source: createdOutput,
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

            expect(response.responses[0]?.result).toBe(ItemStackResponseResult.OK);
            expect(inventory.getItem(0).getName()).toBe('minecraft:redstone_lamp');
            expect(inventory.getItem(0).getBlockRuntimeId()).toBe(output.blockRuntimeId);
        });

        it('undoes everything when a later step fails', async () => {
            // A request is all or nothing. Its steps used to be applied as they were read and
            // a refusal simply returned, so a request that failed on its last action kept what
            // the earlier ones had done - while the client, told only that the whole request
            // failed, put all of it back. A plank left in the crafting grid on the server and
            // not on the screen then made every later craft match a grid nobody could see.
            const server = fakeServer([], {
                getRecipeManager: () => stub<RecipeManager>({ getByNetId: () => null })
            });

            const inventory = new HumanInventory();
            inventory.setItem(
                0,
                new ContainerEntry({ item: new Item({ runtimeId: 1, name: 'minecraft:oak_planks' }) })
            );
            const craftingInput = new CraftingInput();

            const response = await run(
                [
                    {
                        requestId: -5,
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

            expect(response.responses[0]?.result).toBe(ItemStackResponseResult.ERROR);
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
                        requestId: -9,
                        actions: [{ type: ItemStackRequestActionType.CRAFTING_LOOM }],
                        filterStrings: [],
                        filterStringCause: 0
                    }
                ],
                new HumanInventory(),
                server
            );

            expect(response.responses[0]?.result).toBe(ItemStackResponseResult.ERROR);
            expect(response.responses[0]?.requestId).toBe(-9);
            expect(response.responses[0]?.containers).toHaveLength(0);
        });

        it('refuses a slot outside the inventory', async () => {
            const server = fakeServer([]);

            const response = await run(
                [
                    {
                        requestId: -5,
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

            expect(response.responses[0]?.result).toBe(ItemStackResponseResult.ERROR);
        });

        it('crafts what the grid actually holds', async () => {
            // The whole chain: a recipe registered, a grid filled, the client naming the
            // recipe by number, and the output landing in the inventory.
            const planks = () => new Item({ runtimeId: 1, name: 'minecraft:oak_planks' });
            const recipe = new ShapelessRecipe(
                'sticks',
                'crafting_table',
                [new ItemIngredient('minecraft:oak_planks'), new ItemIngredient('minecraft:oak_planks')],
                [new Item({ runtimeId: 2, name: 'minecraft:stick' })]
            );

            const manager = new RecipeManager({ getLogger: () => ({ debug: () => {} }), emit: async () => {} });
            await manager.registerRecipe(recipe);
            const registry = new StationRegistry();
            const server = stub<Server>({
                getRecipeManager: () => manager,
                getStationRegistry: () => registry,
                getLogger: () => stub<Logger>({ debug: () => {} }),
                getContent: () => testContent()
            });
            registry.registerRecipeStations(server);

            const craftingInput = new CraftingInput();
            craftingInput.set(0, planks());
            craftingInput.set(1, planks());

            const inventory = new HumanInventory();
            const response = await run(
                [
                    {
                        requestId: -3,
                        actions: [
                            { type: ItemStackRequestActionType.CRAFTING_RECIPE, recipeNetId: 1, repetitions: 1 },
                            { type: ItemStackRequestActionType.CRAFTING_CONSUME_INPUT, count: 1, source: craftSlot(0) },
                            { type: ItemStackRequestActionType.CRAFTING_CONSUME_INPUT, count: 1, source: craftSlot(1) },
                            // The result is taken from the created output, as the retail client
                            // does it at 1.26.52.
                            {
                                type: ItemStackRequestActionType.PLACE,
                                count: 1,
                                source: createdOutput,
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

            expect(response.responses[0]?.result).toBe(ItemStackResponseResult.OK);
            expect(inventory.getItem(0).getName()).toBe('minecraft:stick');
            // Spent, and the client told so - otherwise it keeps showing what it used up.
            expect(craftingInput.isEmpty()).toBe(true);
        });

        it('crafts with jungle planks in the lower rows of a table grid', async () => {
            const base = fixtureDefinitions();
            const definitions = definitionsOf({
                ...base,
                recipesJava: new Map([
                    ...base.recipesJava,
                    [
                        'minecraft:crafting_table',
                        definitionOf('recipesJava', 'minecraft:crafting_table', {
                            type: 'minecraft:crafting_shaped',
                            pattern: ['PP', 'PP'],
                            key: { P: '#minecraft:planks' },
                            result: { id: 'minecraft:crafting_table' }
                        })
                    ]
                ]),
                tags: new Map([
                    ...base.tags,
                    [
                        'item/minecraft:planks',
                        definitionOf('tags', 'item/minecraft:planks', {
                            values: ItemTags['minecraft:planks']
                        })
                    ]
                ])
            });
            const content = buildServerContent({
                ...fixtureContentOptions(),
                blockPalette: vanillaBlockPalette(),
                itemDefinitions: vanillaItemDefinitions(),
                load: () => ({ definitions, diagnostics: [] })
            });
            // This crafting fixture only declares the blocks used by the handler. The client
            // still has the full vanilla palette, so give the payload builder that palette
            // while retaining the fixture's recipes, tags, and item registry.
            const wireContent = { ...content, blocks: { ...content.blocks, palette: vanillaBlockPalette() } };
            const logs: string[] = [];
            const server = fakeServer([], {
                getContent: () => wireContent,
                getLogger: () =>
                    stub<Logger>({
                        debug: (...values) => void logs.push(values.map(String).join(' ')),
                        info: () => {},
                        warn: () => {},
                        error: (...values) => void logs.push(values.map(String).join(' '))
                    })
            });
            const craftingInput = new CraftingInput();
            craftingInput.useGrid(CraftingInput.LARGE);
            for (const index of [3, 4, 6, 7]) {
                craftingInput.set(index, new Item({ name: 'minecraft:jungle_planks', meta: 0 }));
            }
            const inventory = new HumanInventory();

            const response = await run(
                [
                    {
                        requestId: -3,
                        actions: [
                            {
                                type: ItemStackRequestActionType.CRAFTING_RECIPE,
                                recipeNetId: content.recipes.netIds.get('minecraft:crafting_table'),
                                repetitions: 1
                            },
                            ...[3, 4, 6, 7].map((index) => ({
                                type: ItemStackRequestActionType.CRAFTING_CONSUME_INPUT,
                                count: 1,
                                source: tableSlot(index)
                            })),
                            {
                                type: ItemStackRequestActionType.PLACE,
                                count: 1,
                                source: createdOutput,
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

            expect(response.responses[0]?.result, logs.join('\n')).toBe(ItemStackResponseResult.OK);
            expect(inventory.getItem(0).getName()).toBe('minecraft:crafting_table');
            expect(craftingInput.isEmpty()).toBe(true);
        });

        it.each(['minecraft:crimson_planks', 'minecraft:warped_planks', 'minecraft:mangrove_planks'])(
            'crafts a crafting table from %s when the client requests the shared plank recipe',
            async (planks) => {
                const recipes = VanillaRecipes.load((name) => ItemTable[name] !== undefined);
                const recipe = recipes.find(
                    (candidate) => candidate.id === 'crafting_table/minecraft:WorkBench_recipeId'
                );
                if (!recipe) throw new Error('the vanilla shared-plank crafting-table recipe was not loaded');

                const tableRecipes = recipes.filter(
                    (candidate) =>
                        candidate.station === 'crafting_table' &&
                        candidate.getOutputs().some((output) => output.getName() === 'minecraft:crafting_table')
                );
                const manager = new RecipeManager({ getLogger: () => ({ debug: () => {} }), emit: async () => {} });
                for (const tableRecipe of tableRecipes) await manager.registerRecipe(tableRecipe);

                const recipeNetId = manager.getNetId(recipe);
                if (recipeNetId === null) throw new Error('the shared-plank recipe has no network id');

                const registry = new StationRegistry();
                const server = stub<Server>({
                    getRecipeManager: () => manager,
                    getStationRegistry: () => registry,
                    getLogger: () => stub<Logger>({ debug: () => {} }),
                    getContent: () => testContent()
                });
                registry.registerRecipeStations(server);

                const craftingInput = new CraftingInput();
                craftingInput.useGrid(CraftingInput.LARGE);
                for (const index of [0, 1, 3, 4]) craftingInput.set(index, new Item({ name: planks }));

                const inventory = new HumanInventory();
                const response = await run(
                    [
                        {
                            requestId: -3,
                            actions: [
                                { type: ItemStackRequestActionType.CRAFTING_RECIPE, recipeNetId, repetitions: 1 },
                                ...[0, 1, 3, 4].map((index) => ({
                                    type: ItemStackRequestActionType.CRAFTING_CONSUME_INPUT,
                                    count: 1,
                                    source: tableSlot(index)
                                })),
                                {
                                    type: ItemStackRequestActionType.PLACE,
                                    count: 1,
                                    source: createdOutput,
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

                expect(response.responses[0]?.result).toBe(ItemStackResponseResult.OK);
                expect(inventory.getItem(0).getName()).toBe('minecraft:crafting_table');
                expect(craftingInput.isEmpty()).toBe(true);
            }
        );

        describe('a crafted stack', () => {
            /** A server that knows one recipe: a diamond in the grid makes `output`. */
            const craftingServer = async (output: Item) => {
                const recipe = new ShapelessRecipe(
                    'test',
                    'crafting_table',
                    [new ItemIngredient('minecraft:diamond')],
                    [output]
                );
                const manager = new RecipeManager({ getLogger: () => ({ debug: () => {} }), emit: async () => {} });
                await manager.registerRecipe(recipe);
                const registry = new StationRegistry();
                const server = stub<Server>({
                    getRecipeManager: () => manager,
                    getStationRegistry: () => registry,
                    getLogger: () => stub<Logger>({ debug: () => {} }),
                    getContent: () => testContent()
                });
                registry.registerRecipeStations(server);
                return server;
            };

            /** One craft, taken into inventory slot 0. */
            const craftInto = async (server: Server, inventory: HumanInventory) => {
                const craftingInput = new CraftingInput();
                craftingInput.set(0, new Item({ name: 'minecraft:diamond' }));

                return run(
                    [
                        {
                            requestId: -3,
                            actions: [
                                { type: ItemStackRequestActionType.CRAFTING_RECIPE, recipeNetId: 1, repetitions: 1 },
                                {
                                    type: ItemStackRequestActionType.PLACE,
                                    count: 1,
                                    source: createdOutput,
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
            };

            it('reads its tags, so a crafted pickaxe harvests stone', async () => {
                // A recipe's output is built from the catalog with no content behind it, and
                // that is where an item reads its tags from.
                const server = await craftingServer(new Item({ name: 'minecraft:diamond_pickaxe' }));
                const inventory = new HumanInventory();

                await craftInto(server, inventory);

                expect(inventory.getItem(0).getName()).toBe('minecraft:diamond_pickaxe');
                expect(inventory.getItem(0).harvests('minecraft:stone')).toBe(true);
            });

            it('adds a second craft to the stack the first one left', async () => {
                // The slot's count was raised and its item's was not, and the answer reads the
                // item's: the client was told the slot still held one.
                const server = await craftingServer(new Item({ name: 'minecraft:stick' }));
                const inventory = new HumanInventory();

                await craftInto(server, inventory);
                const response = await craftInto(server, inventory);

                expect(inventory.getItem(0).getAmount()).toBe(2);
                expect(inventory.getEntry(0)?.getCount()).toBe(2);
                const answered = response.responses[0]?.containers.find(
                    (container) => container.container.containerId === ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY
                );
                expect(answered?.slots[0]?.count).toBe(2);
            });
        });

        describe('paying for a craft', () => {
            /** A server that knows one recipe: two planks side by side make four sticks. */
            const sticksServer = async () => {
                const recipe = new ShapelessRecipe(
                    'sticks',
                    'crafting_table',
                    [new ItemIngredient('minecraft:oak_planks'), new ItemIngredient('minecraft:oak_planks')],
                    [new Item({ name: 'minecraft:stick', count: 4 })]
                );
                const manager = new RecipeManager({ getLogger: () => ({ debug: () => {} }), emit: async () => {} });
                await manager.registerRecipe(recipe);
                const registry = new StationRegistry();
                const server = stub<Server>({
                    getRecipeManager: () => manager,
                    getStationRegistry: () => registry,
                    getLogger: () => stub<Logger>({ debug: () => {} }),
                    getContent: () => testContent()
                });
                registry.registerRecipeStations(server);
                return server;
            };

            /** A grid holding `count` planks in each of its first two slots. */
            const planksGrid = (count: number) => {
                const craftingInput = new CraftingInput();
                craftingInput.set(0, new Item({ name: 'minecraft:oak_planks', count }));
                craftingInput.set(1, new Item({ name: 'minecraft:oak_planks', count }));
                return craftingInput;
            };

            const craft = (
                type: ItemStackRequestActionType,
                repetitions: number,
                spent: Array<{ slot: number; count: number }>,
                taken: number
            ): ItemStackRequest => ({
                requestId: -3,
                actions: [
                    { type, recipeNetId: 1, repetitions },
                    ...spent.map(({ slot: index, count }) => ({
                        type: ItemStackRequestActionType.CRAFTING_CONSUME_INPUT,
                        count,
                        source: craftSlot(index)
                    })),
                    {
                        type: ItemStackRequestActionType.PLACE,
                        count: taken,
                        source: createdOutput,
                        destination: slot(0)
                    }
                ],
                filterStrings: [],
                filterStringCause: 0
            });

            it('refuses a craft whose steps spend less than it costs', async () => {
                // The steps say what is spent, so a client naming one slot of two would have had
                // four sticks for one plank.
                const craftingInput = planksGrid(1);
                const inventory = new HumanInventory();

                const response = await run(
                    [craft(ItemStackRequestActionType.CRAFTING_RECIPE, 1, [{ slot: 0, count: 1 }], 4)],
                    inventory,
                    await sticksServer(),
                    craftingInput
                );

                expect(response.responses[0]?.result).toBe(ItemStackResponseResult.ERROR);
                expect(craftingInput.get(0)?.getAmount()).toBe(1);
                expect(craftingInput.get(1)?.getAmount()).toBe(1);
                expect(inventory.getItem(0).getName()).toBe('minecraft:air');
            });

            it('crafts as many as an automatic craft repeats, and spends that many', async () => {
                const craftingInput = planksGrid(3);
                const inventory = new HumanInventory();

                const response = await run(
                    [
                        craft(
                            ItemStackRequestActionType.CRAFTING_RECIPE_AUTO,
                            2,
                            [
                                { slot: 0, count: 2 },
                                { slot: 1, count: 2 }
                            ],
                            8
                        )
                    ],
                    inventory,
                    await sticksServer(),
                    craftingInput
                );

                expect(response.responses[0]?.result).toBe(ItemStackResponseResult.OK);
                expect(inventory.getItem(0).getName()).toBe('minecraft:stick');
                expect(inventory.getItem(0).getAmount()).toBe(8);
                expect(craftingInput.get(0)?.getAmount()).toBe(1);
                expect(craftingInput.get(1)?.getAmount()).toBe(1);
            });

            it('takes no more out of the created output than the craft made', async () => {
                // The step's count was believed, so one craft placed as many sticks as it asked for.
                const inventory = new HumanInventory();

                await run(
                    [
                        craft(
                            ItemStackRequestActionType.CRAFTING_RECIPE,
                            1,
                            [
                                { slot: 0, count: 1 },
                                { slot: 1, count: 1 }
                            ],
                            64
                        )
                    ],
                    inventory,
                    await sticksServer(),
                    planksGrid(1)
                );

                expect(inventory.getItem(0).getAmount()).toBe(4);
            });
        });

        it('answers each slot under the container and number the request named', async () => {
            // The offhand is slot 1 to the client and the one slot of its own container here, and
            // a hotbar slot is answered as a hotbar slot rather than as the combined inventory.
            const inventory = new HumanInventory();
            inventory.setItem(
                2,
                new ContainerEntry({ item: new Item({ name: 'minecraft:torch', count: 5 }), count: 5 })
            );

            const response = await run(
                [
                    {
                        requestId: -3,
                        actions: [
                            {
                                type: ItemStackRequestActionType.PLACE,
                                count: 5,
                                source: slot(2, ContainerUiId.HOTBAR),
                                destination: slot(1, ContainerUiId.OFFHAND)
                            }
                        ],
                        filterStrings: [],
                        filterStringCause: 0
                    }
                ],
                inventory,
                fakeServer([])
            );

            expect(inventory.getOffhand().getItem(0).getName()).toBe('minecraft:torch');
            expect(
                response.responses[0]?.containers.map(({ container, slots }) => ({
                    container: container.containerId,
                    slots: slots.map(({ slot: at, count }) => ({ at, count }))
                }))
            ).toEqual([
                { container: ContainerUiId.HOTBAR, slots: [{ at: 2, count: 0 }] },
                { container: ContainerUiId.OFFHAND, slots: [{ at: 1, count: 5 }] }
            ]);
        });

        it('puts what is worn back when a later step fails', async () => {
            const inventory = new HumanInventory();
            inventory.setItem(0, new ContainerEntry({ item: new Item({ name: 'minecraft:iron_helmet' }), count: 1 }));

            const response = await run(
                [
                    {
                        requestId: -5,
                        actions: [
                            {
                                type: ItemStackRequestActionType.PLACE,
                                count: 1,
                                source: slot(0),
                                destination: slot(0, ContainerUiId.ARMOR_CONTAINER)
                            },
                            { type: ItemStackRequestActionType.CRAFTING_LOOM }
                        ],
                        filterStrings: [],
                        filterStringCause: 0
                    }
                ],
                inventory,
                fakeServer([])
            );

            expect(response.responses[0]?.result).toBe(ItemStackResponseResult.ERROR);
            expect(inventory.getArmor().isEmpty(0)).toBe(true);
            expect(inventory.getItem(0).getName()).toBe('minecraft:iron_helmet');
        });

        it('refuses a recipe the grid does not actually hold', async () => {
            // Believing the client's number would let a player craft anything by naming it.
            const recipe = new ShapelessRecipe(
                'sticks',
                'crafting_table',
                [new ItemIngredient('minecraft:oak_planks')],
                [new Item({ runtimeId: 2, name: 'minecraft:stick' })]
            );

            const manager = new RecipeManager({ getLogger: () => ({ debug: () => {} }), emit: async () => {} });
            await manager.registerRecipe(recipe);
            const registry = new StationRegistry();
            const server = stub<Server>({
                getRecipeManager: () => manager,
                getStationRegistry: () => registry,
                getLogger: () => stub<Logger>({ debug: () => {} }),
                getContent: () => testContent()
            });
            registry.registerRecipeStations(server);

            const empty = new CraftingInput();
            const response = await run(
                [
                    {
                        requestId: -9,
                        actions: [{ type: ItemStackRequestActionType.CRAFTING_RECIPE, recipeNetId: 1, repetitions: 1 }],
                        filterStrings: [],
                        filterStringCause: 0
                    }
                ],
                new HumanInventory(),
                server,
                empty
            );

            expect(response.responses[0]?.result).toBe(ItemStackResponseResult.ERROR);
        });

        it('moves a stack into the crafting grid, which is how anything gets made', async () => {
            const craftingInput = new CraftingInput();
            const inventory = new HumanInventory();
            inventory.setItem(
                0,
                new ContainerEntry({ item: new Item({ runtimeId: 1, name: 'minecraft:oak_planks' }) })
            );

            await run(
                [
                    {
                        requestId: -5,
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
            const server = fakeServer([new Item({ runtimeId: 5, name: 'minecraft:oak_planks' })]);

            const response = await run(
                [
                    {
                        requestId: -1,
                        actions: [
                            { type: ItemStackRequestActionType.CREATIVE_CREATE, creativeItemNetId: 1, repetitions: 1 },
                            {
                                type: ItemStackRequestActionType.PLACE,
                                count: 1,
                                source: slot(0, ContainerUiId.CREATED_OUTPUT),
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

        it('refuses a request id no client makes up, and answers under that same id', async () => {
            // A client's ids are negative and odd. Positive ones are the server's own stack
            // ids and negative even ones are legacy request ids, so either here is a request
            // from something other than the game.
            const server = fakeServer([]);
            const inventory = new HumanInventory();
            inventory.setItem(0, new ContainerEntry({ item: new Item({ runtimeId: 1, name: 'minecraft:stone' }) }));

            for (const requestId of [4, -2]) {
                const response = await run(
                    [
                        {
                            requestId,
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

                expect(response.responses[0]).toEqual({
                    result: ItemStackResponseResult.ERROR,
                    requestId,
                    containers: []
                });
                expect(inventory.getItem(0).getName()).toBe('minecraft:stone');
            }
        });

        it('refuses a request with no actions', async () => {
            const response = await run(
                [{ requestId: -1, actions: [], filterStrings: [], filterStringCause: 0 }],
                new HumanInventory(),
                fakeServer([])
            );

            expect(response.responses[0]?.result).toBe(ItemStackResponseResult.ERROR);
            expect(response.responses[0]?.requestId).toBe(-1);
        });

        it('refuses an amount outside one to sixty-four', async () => {
            const server = fakeServer([]);

            for (const count of [0, 65]) {
                const inventory = new HumanInventory();
                inventory.setItem(0, new ContainerEntry({ item: new Item({ runtimeId: 1, name: 'minecraft:stone' }) }));

                const response = await run(
                    [
                        {
                            requestId: -1,
                            actions: [
                                {
                                    type: ItemStackRequestActionType.PLACE,
                                    count,
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

                expect(response.responses[0]?.result).toBe(ItemStackResponseResult.ERROR);
                expect(inventory.getItem(0).getName()).toBe('minecraft:stone');
            }
        });

        it('answers a request whose step threw, and puts things back', async () => {
            // The exception used to escape the handler, so nothing was sent and the client
            // kept its prediction for a move the server never made.
            class Broken extends HumanInventory {
                public override removeItem(slot: number): never {
                    throw new Error(`cannot empty slot ${slot}`);
                }
            }
            const inventory = new Broken();
            inventory.setItem(0, new ContainerEntry({ item: new Item({ runtimeId: 1, name: 'minecraft:stone' }) }));

            const response = await run(
                [
                    {
                        requestId: -1,
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
                fakeServer([])
            );

            expect(response.responses[0]).toEqual({
                result: ItemStackResponseResult.ERROR,
                requestId: -1,
                containers: []
            });
            expect(inventory.getItem(0).getName()).toBe('minecraft:stone');
            expect(inventory.getItem(5).getName()).toBe('minecraft:air');
        });

        it('names only the containers something changed in', async () => {
            // The two kept stores used to be listed in every answer, slots or no slots.
            const server = fakeServer([new Item({ runtimeId: 5, name: 'minecraft:oak_planks' })]);

            const response = await run(
                [
                    {
                        requestId: -7,
                        actions: [
                            { type: ItemStackRequestActionType.CREATIVE_CREATE, creativeItemNetId: 1, repetitions: 1 },
                            {
                                type: ItemStackRequestActionType.PLACE,
                                count: 64,
                                source: slot(0, ContainerUiId.CREATED_OUTPUT),
                                destination: slot(3)
                            }
                        ],
                        filterStrings: [],
                        filterStringCause: 0
                    }
                ],
                new HumanInventory(),
                server
            );

            expect(response.responses[0]?.containers.map((container) => container.container.containerId)).toEqual([
                ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY
            ]);
        });
    });
});
