/**
 * A player enchanting an item and repairing one, through the real request path.
 *
 * Both rules were already written and tested in `enchantment/`, and neither had a caller: the
 * table and the anvil opened no screen and nothing turned a client's `ItemStackRequest` into a
 * `takeEnchantingRow` or a `takeFromAnvil`. What this file checks is the path between the two,
 * from the `PLACE` that drops an item into the table to the stack that comes back enchanted.
 *
 * The enchantment bodies are copied from Java 26.3's `data/minecraft/enchantment/`.
 */
import { ContainerUiId, WindowTypes } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import { definitionOf, definitionsOf } from '../../content/ContentOptions';
import { buildServerContent } from '../../content/ServerContent';
import type { ServerContent } from '../../content/ServerContent';
import { fixtureBlockPalette, fixtureItemDefinitions } from '../../content/testing';
import CraftingInput from '../../crafting/CraftingInput';
import { AttributeIds, Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';
import ContainerEntry from '../../inventory/ContainerEntry';
import HumanInventory from '../../inventory/HumanInventory';
import { Item } from '../../item/Item';
import type Player from '../../Player';
import type Server from '../../Server';
import { enchantingRows, enchantmentSeedOf } from '../../enchantment/enchantingTable';
import { stub } from '../../testing/stub.test.helper';
import type { World } from '../../world/World';
import type { Logger } from '@jsprismarine/logger';
import type { OpenBlockContainer } from '../PlayerSession';
import type PlayerSession from '../PlayerSession';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import ItemStackRequestPacket from '@jsprismarine/protocol/packet/ItemStackRequestPacket';
import ItemStackResponsePacket, {
    ItemStackResponseResult
} from '@jsprismarine/protocol/packet/ItemStackResponsePacket';
import PlayerEnchantOptionsPacket from '@jsprismarine/protocol/packet/PlayerEnchantOptionsPacket';
import type { ItemStackRequest, ItemStackRequestSlotInfo } from '@jsprismarine/protocol';
import { ItemStackRequestActionType } from '@jsprismarine/protocol';
import ItemStackRequestHandler from './ItemStackRequestHandler';

/** Both enchantments are mainhand mining ones, which is what a pickaxe can take. */
const MINING = {
    anvil_cost: 1,
    description: { translate: 'enchantment' },
    slots: ['mainhand'],
    supported_items: '#minecraft:enchantable/mining',
    primary_items: '#minecraft:enchantable/mining',
    weight: 10
};

const content = (): ServerContent =>
    buildServerContent({
        load: () => ({
            definitions: definitionsOf({
                enchantments: new Map([
                    [
                        'minecraft:efficiency',
                        definitionOf('enchantments', 'minecraft:efficiency', {
                            ...MINING,
                            max_level: 5,
                            max_cost: { base: 51, per_level_above_first: 10 },
                            min_cost: { base: 1, per_level_above_first: 10 },
                            effects: {}
                        })
                    ],
                    [
                        'minecraft:unbreaking',
                        definitionOf('enchantments', 'minecraft:unbreaking', {
                            ...MINING,
                            anvil_cost: 2,
                            max_level: 3,
                            max_cost: { base: 56, per_level_above_first: 8 },
                            min_cost: { base: 5, per_level_above_first: 8 },
                            weight: 5,
                            effects: {}
                        })
                    ]
                ]),
                tags: new Map([
                    [
                        'item/minecraft:enchantable/mining',
                        definitionOf('tags', 'item/minecraft:enchantable/mining', {
                            values: ['minecraft:diamond_pickaxe']
                        })
                    ],
                    [
                        'enchantment/minecraft:in_enchanting_table',
                        definitionOf('tags', 'enchantment/minecraft:in_enchanting_table', {
                            values: ['minecraft:efficiency', 'minecraft:unbreaking']
                        })
                    ]
                ])
            }),
            diagnostics: []
        }),
        blockPalette: fixtureBlockPalette(),
        itemDefinitions: fixtureItemDefinitions()
    });

const slot = (slotId: number, containerId = ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY): ItemStackRequestSlotInfo => ({
    container: { containerId, dynamicId: null },
    slotId,
    stackNetId: 0
});

const pickaxe = () => new Item({ name: 'minecraft:diamond_pickaxe' });

/** A table or an anvil standing at the origin, with nothing in it yet. */
const openScreen = (screen: WindowTypes): OpenBlockContainer => ({
    windowId: 1,
    position: new Vector3(0, 64, 0),
    identifier: screen === WindowTypes.ANVIL ? 'minecraft:anvil' : 'minecraft:enchanting_table',
    screen,
    inputs: [null, null, null],
    // Fifteen bookshelves' worth, which is what gives the table rows worth taking. The real
    // path fills this from `refreshEnchantOptions`, which counts them.
    bookshelfPower: 15
});

/** A player at a workstation, with the levels to pay for what it offers. */
const scene = (open: OpenBlockContainer) => {
    const built = content();
    const inventory = new HumanInventory();
    const attributes = new Attributes(Attributes.getPlayerDefaults());
    const sent: NetworkPacket[] = [];

    const server = stub<Server>({
        getLogger: () => stub<Logger>({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
        getContent: () => built
    });

    const player: Player = stub<Player>({
        getType: () => 'minecraft:player',
        getName: () => 'tester',
        getServer: () => server,
        getWorld: () =>
            stub<World>({
                getBlockState: async () => ({ name: 'minecraft:bookshelf' }) as never,
                getPlayers: () => []
            }),
        getPosition: () => ({ getX: () => 0, getY: () => 64, getZ: () => 0 }) as never,
        getEquipment: () => ({}),
        getInventory: () => inventory,
        getCraftingInput: () => new CraftingInput(),
        attributes,
        metadata: { sprinting: false } as never,
        gamemode: 0,
        isSneaking: () => false,
        isFlying: () => false,
        getFood: () => 20,
        getSaturation: () => 5,
        getNetworkSession: () => session
    });

    const session: PlayerSession = stub<PlayerSession>({
        getPlayer: () => player,
        getOpenBlockContainer: () => open,
        send: async (packet: NetworkPacket) => void sent.push(packet)
    });

    attributes.setValue(AttributeIds.PlayerLevel, 30);

    // Pinned, because an unseeded player draws one at random and which of the three rows has
    // anything in it is a function of the seed.
    const seed = enchantmentSeedOf(player, 1234);

    const run = async (requests: ItemStackRequest[]) => {
        await new ItemStackRequestHandler().handle(
            Object.assign(new ItemStackRequestPacket(), { requests }),
            server,
            session
        );

        const response = sent.find((packet): packet is ItemStackResponsePacket => {
            return packet instanceof ItemStackResponsePacket;
        });
        if (!response) throw new Error('no ItemStackResponsePacket was sent');
        return response;
    };

    /** The one-based net id of the first row with something in it at this seed and power. */
    const filledRow = (stack: Item): number => {
        if (built === undefined) throw new Error('no content to draw rows from');

        const rows = enchantingRows(built.enchantments, stack, seed, open.bookshelfPower);
        const index = rows.findIndex((row) => row.picks.length > 0);
        if (index === -1) throw new Error('no row has anything in it');

        return index + 1;
    };

    return { player, inventory, attributes, sent, run, open, filledRow };
};

/** One request moving the stack in slot 0 into the workstation's item slot. */
const placeInWorkstation = (containerId: number): ItemStackRequest => ({
    requestId: -1,
    actions: [
        {
            type: ItemStackRequestActionType.PLACE,
            count: 1,
            source: slot(0),
            destination: slot(0, containerId)
        }
    ],
    filterStrings: [],
    filterStringCause: 0
});

describe('a workstation screen', () => {
    describe('the enchanting table', () => {
        it('takes a stack into its input slot and redraws the rows', async () => {
            const { inventory, run, open, sent } = scene(openScreen(WindowTypes.ENCHANTMENT));
            inventory.setItem(0, new ContainerEntry({ item: pickaxe(), count: 1 }));

            const response = await run([placeInWorkstation(ContainerUiId.ENCHANTING_INPUT_CONTAINER)]);

            expect(response.responses[0]?.result).toBe(ItemStackResponseResult.OK);
            expect(open.inputs[0]?.getName()).toBe('minecraft:diamond_pickaxe');
            expect(inventory.getItem(0).getName()).toBe('minecraft:air');

            // The table's offers are a function of the stack, so putting one in redraws them.
            const options = sent.find((packet) => packet instanceof PlayerEnchantOptionsPacket);
            expect(options).toBeInstanceOf(PlayerEnchantOptionsPacket);
            expect(options?.getPacketData()?.options.length ?? 0).toBeGreaterThan(0);

            // And the answer names the container the client knows that slot by.
            const named = response.responses[0]?.containers.map((container) => container.container.containerId);
            expect(named).toContain(ContainerUiId.ENCHANTING_INPUT_CONTAINER);
        });

        it('enchants the stack and charges the levels when a row is taken', async () => {
            const { inventory, attributes, run, open, filledRow } = scene(openScreen(WindowTypes.ENCHANTMENT));
            inventory.setItem(0, new ContainerEntry({ item: pickaxe(), count: 1 }));

            await run([placeInWorkstation(ContainerUiId.ENCHANTING_INPUT_CONTAINER)]);

            const response = await run([
                {
                    requestId: -3,
                    actions: [
                        {
                            type: ItemStackRequestActionType.CRAFTING_RECIPE,
                            recipeNetId: filledRow(pickaxe()),
                            repetitions: 1
                        },
                        {
                            type: ItemStackRequestActionType.PLACE,
                            count: 1,
                            source: slot(0, ContainerUiId.CREATED_OUTPUT),
                            destination: slot(5)
                        }
                    ],
                    filterStrings: [],
                    filterStringCause: 0
                }
            ]);

            expect(response.responses.at(-1)?.result).toBe(ItemStackResponseResult.OK);

            const enchanted = inventory.getItem(5);
            expect(enchanted.getName()).toBe('minecraft:diamond_pickaxe');
            expect(enchanted.getEnchantments().size).toBeGreaterThan(0);

            // Paid for, and the table is empty again.
            expect(attributes.getValue(AttributeIds.PlayerLevel)).toBeLessThan(30);
            expect(open.inputs[0]).toBeNull();
        });

        it('refuses a row with nothing in the table', async () => {
            const { run } = scene(openScreen(WindowTypes.ENCHANTMENT));

            const response = await run([
                {
                    requestId: -5,
                    actions: [{ type: ItemStackRequestActionType.CRAFTING_RECIPE, recipeNetId: 1, repetitions: 1 }],
                    filterStrings: [],
                    filterStringCause: 0
                }
            ]);

            expect(response.responses[0]?.result).toBe(ItemStackResponseResult.ERROR);
        });
    });

    describe('the anvil', () => {
        it('repairs two of the same item and gives it the typed name', async () => {
            const { inventory, run, open } = scene(openScreen(WindowTypes.ANVIL));
            const base = pickaxe();
            const addition = pickaxe();
            base.durability = Math.floor(base.getMaxDurability() / 2);
            addition.durability = Math.floor(addition.getMaxDurability() / 2);

            inventory.setItem(0, new ContainerEntry({ item: base, count: 1 }));
            inventory.setItem(1, new ContainerEntry({ item: addition, count: 1 }));

            await run([placeInWorkstation(ContainerUiId.ANVIL_INPUT_CONTAINER)]);
            await run([
                {
                    requestId: -7,
                    actions: [
                        {
                            type: ItemStackRequestActionType.PLACE,
                            count: 1,
                            source: slot(1),
                            destination: slot(0, ContainerUiId.ANVIL_MATERIAL_CONTAINER)
                        }
                    ],
                    filterStrings: [],
                    filterStringCause: 0
                }
            ]);

            expect(open.inputs[0]?.getName()).toBe('minecraft:diamond_pickaxe');
            expect(open.inputs[1]?.getName()).toBe('minecraft:diamond_pickaxe');

            const response = await run([
                {
                    requestId: -9,
                    actions: [
                        {
                            type: ItemStackRequestActionType.CRAFTING_RECIPE_OPTIONAL,
                            recipeNetId: 0,
                            repetitions: 0
                        },
                        {
                            type: ItemStackRequestActionType.PLACE,
                            count: 1,
                            source: slot(0, ContainerUiId.CREATED_OUTPUT),
                            destination: slot(9)
                        }
                    ],
                    filterStrings: ['Hole Maker'],
                    filterStringCause: 0
                }
            ]);

            expect(response.responses.at(-1)?.result).toBe(ItemStackResponseResult.OK);

            const repaired = inventory.getItem(9);
            expect(repaired.getName()).toBe('minecraft:diamond_pickaxe');
            expect(repaired.getDurability()).toBeGreaterThan(base.getMaxDurability() / 2);
            expect(repaired.getCustomName()).toBe('Hole Maker');
            expect(open.inputs[0]).toBeNull();
            expect(open.inputs[1]).toBeNull();
        });

        it('refuses a craft with no anvil open', async () => {
            const { run } = scene(openScreen(WindowTypes.ENCHANTMENT));

            const response = await run([
                {
                    requestId: -11,
                    actions: [
                        {
                            type: ItemStackRequestActionType.CRAFTING_RECIPE_OPTIONAL,
                            recipeNetId: 0,
                            repetitions: 0
                        }
                    ],
                    filterStrings: [],
                    filterStringCause: 0
                }
            ]);

            expect(response.responses[0]?.result).toBe(ItemStackResponseResult.ERROR);
        });
    });
});
