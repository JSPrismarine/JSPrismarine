import { Vector3 } from '@jsprismarine/math';
import { Attributes } from '@jsprismarine/protocol/bedrock/wire/structures/Attribute';
import { describe, expect, it } from 'vitest';

import type { EntityRuntime } from '../../entity/data/EntityRuntime';
import { PlayerComponents } from '../../entity/playerComponents';
import ContainerEntry from '../../inventory/ContainerEntry';
import HumanInventory from '../../inventory/HumanInventory';
import { Item } from '../../item/Item';
import type PlayerSession from '../../network/PlayerSession';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { stubPlayerPort } from '../../testing/playerPort.test.helper';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type { BlockMining } from '../../world/BlockMining';
import { blockMiningOf, playerMiningOf } from '../../world/BlockMining';
import type { World } from '../../world/World';
import SelectHotbarSlotHandler from './SelectHotbarSlotHandler';

/** A sender holding a sword in hotbar slot 3 and nothing anywhere else, in a world that records crack restarts. */
const fakeWorld = () => {
    /** Every crack restart the world was asked for. */
    const cracking: string[] = [];
    const world = stub<World>({
        stopBlockCracking: () => void cracking.push('stop'),
        startBlockCracking: (position, face, tool, previous) => {
            cracking.push(`start ${tool?.getName() ?? 'hand'} (${previous === null ? 'fresh' : 'continued'})`);
            return { position, face, runtimeId: 1, progressPerTick: 100, breakTicks: 600, startedAt: 50 };
        }
    });

    const inventory = new HumanInventory();
    inventory.setItem(
        3,
        new ContainerEntry({ item: new Item({ runtimeId: 0, name: 'minecraft:diamond_sword' }), count: 1 })
    );

    /** What the sender is mining, which the store player keeps. */
    const components = new PlayerComponents(new Attributes(Attributes.getPlayerDefaults()), () => {});
    const sender = stubPlayerPort({ getInventory: () => inventory, getComponents: () => components });
    // The runtime's answer for a player in no store: the mining lands on the components.
    const inputs = stub<EntityRuntime>({
        setPlayerMining: (_player, mining) => components.set('mining.block', mining)
    });
    const session = stub<PlayerSession>({
        runtimeId: 7n,
        identity: identityNamed('runner'),
        getPlayer: () => sender,
        getWorld: () => world,
        inputs: () => inputs,
        handledInputs: () => 0
    });
    const { context, outputs } = inputContext(session);

    const state = {
        get mining(): BlockMining | null {
            return blockMiningOf(components.get('mining.block'));
        },
        set mining(mining: BlockMining | null) {
            components.set('mining.block', playerMiningOf(mining));
        }
    };

    return { context, outputs, inventory, state, cracking };
};

describe('SelectHotbarSlotHandler', () => {
    /** Mining that began with whatever was in hand: 20 ticks, started at tick 10. */
    const mining = (): BlockMining => ({
        position: new Vector3(1, 64, 1),
        face: 1,
        runtimeId: 1,
        progressPerTick: 3276,
        breakTicks: 20,
        startedAt: 10
    });

    it('starts the mining over for the tool a switch puts in hand', () => {
        const { context, state, cracking } = fakeWorld();
        state.mining = mining();

        new SelectHotbarSlotHandler().handle({ kind: 'selectHotbarSlot', slot: 3 }, context);

        expect(cracking).toEqual(['stop', 'start minecraft:diamond_sword (fresh)']);
        expect(state.mining).toMatchObject({ breakTicks: 600, startedAt: 50 });
    });

    it('leaves the mining alone when the slot already held is reported again', () => {
        const { context, state, cracking } = fakeWorld();
        state.mining = mining();

        new SelectHotbarSlotHandler().handle({ kind: 'selectHotbarSlot', slot: 0 }, context);

        expect(cracking).toEqual([]);
        expect(state.mining).toMatchObject({ breakTicks: 20, startedAt: 10 });
    });

    it('moves the hand to the selected hotbar slot and sends nothing itself', () => {
        // The players that see the sender are shown the hand by the sync.
        const { context, outputs, inventory } = fakeWorld();

        new SelectHotbarSlotHandler().handle({ kind: 'selectHotbarSlot', slot: 3 }, context);

        expect(inventory.getHandSlotIndex()).toBe(3);
        expect(inventory.getItemInHand().getName()).toBe('minecraft:diamond_sword');
        expect(outputs).toHaveLength(0);
    });
});
