/**
 * A player trading with a villager, through the real item stack request path.
 *
 * The offers and the economy are tested in `@jsprismarine/trading`; what this checks is the path
 * between the two: the payment moved into the screen, the request that names an offer by its
 * `netId`, the payment spent and the result taken, and the villager's state moving only when the
 * request went through.
 */
import { ContainerUiId, WindowTypes } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import { seededRandom } from '@jsprismarine/predicates';
import { Merchant, parseTradeTable } from '@jsprismarine/trading';
import { describe, expect, it } from 'vitest';

import { fixtureBlockPalette, fixtureItemDefinitions } from '../../content/testing';
import { definitionsOf } from '../../content/ContentOptions';
import { buildServerContent } from '../../content/ServerContent';
import CraftingInput from '../../crafting/CraftingInput';
import { AttributeIds, Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';
import ContainerEntry from '../../inventory/ContainerEntry';
import HumanInventory from '../../inventory/HumanInventory';
import { Item } from '../../item/Item';
import type Server from '../../Server';
import { stubPlayerPort } from '../../testing/playerPort.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { experienceIn } from '../../testing/playerDouble.test.helper';
import type { World } from '../../world/World';
import type { Entity } from '../../entity/Entity';
import type { Logger } from '@jsprismarine/logger';
import type { OpenBlockContainer } from '../PlayerSession';
import type PlayerSession from '../PlayerSession';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import ItemStackRequestPacket from '@jsprismarine/protocol/packet/ItemStackRequestPacket';
import ItemStackResponsePacket, {
    ItemStackResponseResult
} from '@jsprismarine/protocol/packet/ItemStackResponsePacket';
import type { ItemStackRequest, ItemStackRequestSlotInfo } from '@jsprismarine/protocol';
import { ItemStackRequestActionType } from '@jsprismarine/protocol';
import ItemStackRequestHandler from './ItemStackRequestHandler';

const FARMER = parseTradeTable(
    {
        tiers: [
            {
                total_exp_required: 0,
                groups: [
                    {
                        num_to_select: -1,
                        trades: [
                            {
                                wants: [{ item: 'minecraft:emerald', quantity: 3 }],
                                gives: [{ item: 'minecraft:bread', quantity: 6 }],
                                trader_exp: 5,
                                max_uses: 2,
                                reward_exp: true
                            }
                        ]
                    }
                ]
            },
            {
                total_exp_required: 10,
                groups: [
                    {
                        num_to_select: -1,
                        trades: [
                            {
                                wants: [{ item: 'minecraft:wheat', quantity: 20 }],
                                gives: [{ item: 'minecraft:emerald', quantity: 1 }],
                                trader_exp: 2,
                                max_uses: 16,
                                reward_exp: false
                            }
                        ]
                    }
                ]
            }
        ]
    },
    { pack: 'test' }
)!;

const slot = (slotId: number, containerId = ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY): ItemStackRequestSlotInfo => ({
    container: { containerId, dynamicId: null },
    slotId,
    stackNetId: 0
});

const scene = () => {
    const merchant = new Merchant({ table: FARMER, random: seededRandom(1) });
    const inventory = new HumanInventory();
    const attributes = new Attributes(Attributes.getPlayerDefaults());
    const sent: NetworkPacket[] = [];
    const log: string[] = [];
    const content = buildServerContent({
        load: () => ({ definitions: definitionsOf({}), diagnostics: [] }),
        blockPalette: fixtureBlockPalette(),
        itemDefinitions: fixtureItemDefinitions()
    });
    const server = stub<Server>({
        getLogger: () => stub<Logger>({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
        getContent: () => content
    });
    const open: OpenBlockContainer = {
        windowId: 1,
        position: new Vector3(0, 64, 0),
        identifier: 'minecraft:villager_v2',
        screen: WindowTypes.TRADE,
        inputs: [null, null],
        bookshelfPower: 0,
        trade: {
            trader: stub<Entity>({}),
            source: merchant,
            context: () => ({}),
            release: () => undefined,
            traded: (result) => void log.push(`traded ${result.traded}`)
        }
    };

    const player = stubPlayerPort({
        getType: () => 'minecraft:player',
        getName: () => 'tester',
        getServer: () => server,
        getWorld: () => stub<World>({ getPlayers: () => [] }),
        getPosition: () => ({ getX: () => 0, getY: () => 64, getZ: () => 0 }) as never,
        getEquipment: () => ({}),
        getInventory: () => inventory,
        getCraftingInput: () => new CraftingInput(),
        attributes,
        getExperience: () => experienceIn(attributes),
        metadata: { sprinting: false } as never,
        gamemode: 0,
        isSneaking: () => false,
        isFlying: () => false,
        getNetworkSession: () => session
    });

    const redraws: number[] = [];
    const session: PlayerSession = stub<PlayerSession>({
        getPlayer: () => player,
        getOpenBlockContainer: () => open,
        send: async (packet: NetworkPacket) => void sent.push(packet),
        sendTradeOffers: async () => void redraws.push(merchant.offers()[0]?.uses ?? -1)
    });

    const run = async (request: ItemStackRequest): Promise<ItemStackResponsePacket> => {
        sent.length = 0;
        await new ItemStackRequestHandler().handle(
            Object.assign(new ItemStackRequestPacket(), { requests: [request] }),
            server,
            session
        );
        const response = sent.find(
            (packet): packet is ItemStackResponsePacket => packet instanceof ItemStackResponsePacket
        );
        if (!response) throw new Error('no ItemStackResponsePacket was sent');
        return response;
    };

    return { merchant, inventory, attributes, open, run, log, redraws };
};

const request = (requestId: number, ...actions: ItemStackRequest['actions']): ItemStackRequest => ({
    requestId,
    actions,
    filterStrings: [],
    filterStringCause: 0
});

/** Moves `count` of the stack in inventory slot 0 into a payment slot. */
const pay = (count: number, paymentSlot = 0) =>
    request(-1, {
        type: ItemStackRequestActionType.PLACE,
        count,
        source: slot(0),
        destination: slot(
            0,
            paymentSlot === 0 ? ContainerUiId.TRADE2_INGREDIENT1_CONTAINER : ContainerUiId.TRADE2_INGREDIENT2_CONTAINER
        )
    });

/** Makes offer `netId`, spending `spend` from the first payment slot, and takes the result into slot 5. */
const makeOffer = (netId: number, spend: number) =>
    request(
        -3,
        { type: ItemStackRequestActionType.CRAFTING_RECIPE, recipeNetId: netId, repetitions: 1 },
        {
            type: ItemStackRequestActionType.CRAFTING_CONSUME_INPUT,
            count: spend,
            source: slot(0, ContainerUiId.TRADE2_INGREDIENT1_CONTAINER)
        },
        {
            type: ItemStackRequestActionType.PLACE,
            count: 6,
            source: slot(0, ContainerUiId.CREATED_OUTPUT),
            destination: slot(5)
        }
    );

describe('a villager trade screen', () => {
    it('spends the payment, hands over the result and moves the villager', async () => {
        const { merchant, inventory, open, run, log, redraws } = scene();
        inventory.setItem(0, new ContainerEntry({ item: new Item({ name: 'minecraft:emerald' }), count: 3 }));
        await run(pay(3));

        const response = await run(makeOffer(1, 3));

        expect(response.responses[0]?.result).toBe(ItemStackResponseResult.OK);
        expect(inventory.getItem(5).getName()).toBe('minecraft:bread');
        expect(inventory.getEntry(5)?.getCount()).toBe(6);
        expect(open.inputs[0]).toBeNull();
        expect(merchant.offers()[0]?.uses).toBe(1);
        expect(merchant.experience).toBe(5);
        expect(log).toEqual(['traded true']);
        // The screen is redrawn with the stock as it now stands, after the answer went out.
        expect(redraws).toEqual([1]);
    });

    it('pays the player the offer’s experience', async () => {
        const { attributes, inventory, run } = scene();
        inventory.setItem(0, new ContainerEntry({ item: new Item({ name: 'minecraft:emerald' }), count: 3 }));
        await run(pay(3));
        expect(attributes.getValue(AttributeIds.PlayerLevel) + attributes.getValue(AttributeIds.PlayerExperience)).toBe(
            0
        );

        await run(makeOffer(1, 3));

        expect(
            attributes.getValue(AttributeIds.PlayerLevel) * 10 + attributes.getValue(AttributeIds.PlayerExperience)
        ).toBeGreaterThan(0);
    });

    it('refuses an offer the payment does not cover, and leaves the villager and the payment alone', async () => {
        const { merchant, inventory, open, run, log } = scene();
        inventory.setItem(0, new ContainerEntry({ item: new Item({ name: 'minecraft:emerald' }), count: 2 }));
        await run(pay(2));

        const response = await run(makeOffer(1, 2));

        expect(response.responses[0]?.result).toBe(ItemStackResponseResult.ERROR);
        expect(open.inputs[0]?.getAmount()).toBe(2);
        expect(inventory.getItem(5).getName()).toBe('minecraft:air');
        expect(merchant.offers()[0]?.uses).toBe(0);
        expect(log).toEqual([]);
    });

    it('refuses the wrong item as payment', async () => {
        const { merchant, inventory, run } = scene();
        inventory.setItem(0, new ContainerEntry({ item: new Item({ name: 'minecraft:diamond' }), count: 3 }));
        await run(pay(3));

        const response = await run(makeOffer(1, 3));

        expect(response.responses[0]?.result).toBe(ItemStackResponseResult.ERROR);
        expect(merchant.offers()[0]?.uses).toBe(0);
    });

    it('refuses an offer that does not exist and one that is sold out', async () => {
        const { merchant, inventory, run } = scene();
        inventory.setItem(0, new ContainerEntry({ item: new Item({ name: 'minecraft:emerald' }), count: 9 }));

        await run(pay(3));
        expect((await run(makeOffer(7, 3))).responses[0]?.result).toBe(ItemStackResponseResult.ERROR);

        // Two uses are all it has: the third request finds the offer sold out.
        await run(makeOffer(1, 3));
        await run(pay(3));
        await run(makeOffer(1, 3));
        await run(pay(3));
        const third = await run(makeOffer(1, 3));

        expect(merchant.offers()[0]?.uses).toBe(2);
        expect(third.responses[0]?.result).toBe(ItemStackResponseResult.ERROR);
    });

    it('unlocks the next tier once the experience arrives', async () => {
        const { merchant, inventory, run } = scene();
        inventory.setItem(0, new ContainerEntry({ item: new Item({ name: 'minecraft:emerald' }), count: 9 }));
        await run(pay(3));
        await run(makeOffer(1, 3));
        await run(pay(3));
        await run(makeOffer(1, 3));

        expect(merchant.level).toBe(2);
        expect(merchant.offers()).toHaveLength(2);
    });
});
