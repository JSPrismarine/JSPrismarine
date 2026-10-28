import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { ContainerUiId, Gametype } from '@jsprismarine/minecraft';
import { describe, expect, it, vi } from 'vitest';

// A reused Vitest worker may already have the handler's real dependencies in its module cache.
vi.hoisted(() => vi.resetModules());

import type Player from '../../Player';
import type Server from '../../Server';
import type { Config } from '../../config/Config';
import { loose } from '../../entity/Archery';
import { meleeAttack } from '../../entity/Combat';
import type { Entity } from '../../entity/Entity';
import type { Metadata } from '../../entity/Metadata';
import ContainerEntry from '../../inventory/ContainerEntry';
import HumanInventory from '../../inventory/HumanInventory';
import { Item } from '../../item/Item';
import { stub } from '../../testing/stub.test.helper';
import BlockPosition from '../../world/BlockPosition';
import { Dimensions } from '../../world/Dimension';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type PlayerSession from '../PlayerSession';
import type { ReleaseItemData, UseItemData, UseItemOnEntityData } from '../packet/InventoryTransactionPacket';
import InventoryTransactionPacket, {
    InventorySourceType,
    HandSlot,
    InventoryAction,
    ItemReleaseActionType,
    TransactionType,
    ItemUseActionType,
    ItemUseOnActorActionType
} from '../packet/InventoryTransactionPacket';
import InventoryTransactionHandler, { rejectionReason } from './InventoryTransactionHandler';
import { useItemOnBlock } from '../../item/interaction';
import type { InteractionResult } from '../../item/interaction';
import type { ServerWorldHandle } from '../../content/world/serverSource';
import type { ServerItemActorPort } from '../../item/actorPort';
import { testContent } from '../../testing/entityServer';

// The blow and the shot have modules and tests of their own. Here they are recorded, so a
// test can say what the handler asked for without a world to fight in.
vi.mock('../../entity/Combat', async (importActual) => ({
    ...(await importActual<typeof import('../../entity/Combat')>()),
    meleeAttack: vi.fn(async () => true)
}));
vi.mock('../../entity/Archery', async (importActual) => ({
    ...(await importActual<typeof import('../../entity/Archery')>()),
    loose: vi.fn(async () => true)
}));
// So is the click on a block, which `item/interaction.test.ts` places against a real world.
vi.mock('../../item/interaction', async (importActual) => ({
    ...(await importActual<typeof import('../../item/interaction')>()),
    useItemOnBlock: vi.fn((): InteractionResult => 'handled')
}));

const TICK = 400;

/**
 * A player standing at (0, 64, 0) holding stone in hotbar slot 2, in a world that records
 * what it is asked to break and knows one entity, runtime id 42. The clicks passed on to
 * `useItemOnBlock` are read back from its mock, as what the hand held at each.
 *
 * The inventory is a real one, because the point of half these tests is that the server's
 * copy of the hand decides what happens and not the item the client sent.
 */
const fake = (
    gamemode = Gametype.SURVIVAL,
    held: Item = new Item({ runtimeId: 1, name: 'minecraft:stone' }),
    { serverAuthoritativeBreaking = false } = {}
) => {
    const broken: BlockPosition[] = [];
    const logged: string[] = [];
    const itemUse: string[] = [];
    const entityInteractions: number[] = [];
    const dropped: Item[] = [];
    const inventorySyncs: Array<readonly [number, number, number, Item | null]> = [];
    let exhaustion = 0;

    let zombie: Entity;
    const world = stub<World>({
        breakBlock: async (position) => {
            broken.push(BlockPosition.fromVector3(position));
            return true;
        },
        getEntity: (runtimeId) => (runtimeId === 42n ? zombie : null),
        getDimension: () => Dimensions.Overworld,
        dropFromPlayer: async (_player, contents) => {
            for (const content of contents) if (content instanceof Item) dropped.push(content);
        }
    });
    zombie = stub<Entity>({
        getRuntimeId: () => 42n,
        getType: () => 'minecraft:zombie',
        getPosition: () => new Position(0, 64, 0, world)
    });

    const inventory = new HumanInventory();
    inventory.setItem(2, new ContainerEntry({ item: held, count: 1 }));
    inventory.setHandSlot(2);

    const player = stub<Player>({
        isOnline: () => true,
        getRuntimeId: () => 1n,
        gamemode,
        getName: () => 'tester',
        getPosition: () => new Position(0, 64, 0, world),
        getWorld: () => world,
        getInventory: () => inventory,
        metadata: stub<Metadata>({ sprinting: false }),
        isOnGround: () => true,
        getFallDistance: () => 0,
        isFlying: () => false,
        addExhaustion: (amount) => {
            exhaustion += amount;
        },
        beginItemUse: (tick) => void itemUse.push(`begin ${tick}`),
        takeItemUseTicks: (tick) => {
            itemUse.push(`take ${tick}`);
            return 15;
        }
    });

    const server = stub<Server>({
        getTick: () => TICK,
        getConfig: () => stub<Config>({ getServerAuthoritativeBlockBreaking: () => serverAuthoritativeBreaking }),
        // The two-block fixture. Nothing here reads it, since the click itself is recorded
        // rather than run, but the handler hands it on.
        getContent: () => testContent(),
        getContentWorld: () =>
            stub<ServerWorldHandle>({
                actorsAt: () =>
                    stub<ServerItemActorPort>({
                        duringInteraction: (_source, _target, body) => body(),
                        interactWithEntity: () => {
                            entityInteractions.push(42);
                            return true;
                        }
                    })
            }),
        getLogger: () =>
            stub<Logger>({
                debug: (...message) => void logged.push(`debug: ${String(message[0] ?? '')}`),
                verbose: (...message) => void logged.push(`verbose: ${String(message[0] ?? '')}`),
                error: (...message) => void logged.push(`error: ${String(message[0] ?? '')}`)
            })
    });
    const session = stub<PlayerSession>({
        getPlayer: () => player,
        sendContainerSlot: async (windowId, containerId, slot, item) =>
            void inventorySyncs.push([windowId, containerId, slot, item])
    });

    return {
        get clicked() {
            return vi
                .mocked(useItemOnBlock)
                .mock.calls.filter(([interaction]) => interaction.player === player)
                .map(([{ player: clicker, position, face }]) => {
                    const held = clicker.getInventory().getItemInHand().getName();
                    return `${held} at ${position.x},${position.y},${position.z} face ${face}`;
                });
        },
        broken,
        logged,
        itemUse,
        entityInteractions,
        dropped,
        inventorySyncs,
        exhaustion: () => exhaustion,
        zombie,
        player,
        inventory,
        server,
        session
    };
};

/** A click on the top of the block under the player's feet, from slot 2. */
const useItem = (overrides: Partial<UseItemData> = {}): UseItemData => ({
    kind: 'useItem',
    actionType: ItemUseActionType.PLACE,
    triggerType: 1,
    blockPosition: new BlockPosition(0, 62, 0),
    blockFace: 1,
    hotbarSlot: 2,
    hand: HandSlot.MAINHAND,
    // What the client believes it holds. The handler must not act on it.
    itemInHand: new Item({ runtimeId: 5, name: 'minecraft:diamond_block' }),
    playerPosition: new Vector3(0, 64, 0),
    clickPosition: new Vector3(0.5, 1, 0.5),
    blockRuntimeId: 0,
    clientInteractPrediction: 1,
    clientCooldownState: 0,
    ...overrides
});

const useItemOnEntity = (overrides: Partial<UseItemOnEntityData> = {}): UseItemOnEntityData => ({
    kind: 'useItemOnEntity',
    entityRuntimeId: 42n,
    actionType: ItemUseOnActorActionType.ATTACK,
    hotbarSlot: 2,
    itemInHand: Item.air(),
    playerPosition: new Vector3(0, 64, 0),
    clickPosition: new Vector3(0, 1, 0),
    ...overrides
});

const releaseItem = (overrides: Partial<ReleaseItemData> = {}): ReleaseItemData => ({
    kind: 'releaseItem',
    actionType: ItemReleaseActionType.RELEASE,
    hotbarSlot: 2,
    itemInHand: Item.air(),
    playerPosition: new Vector3(0, 64, 0),
    ...overrides
});

const transaction = (
    type: TransactionType,
    data: UseItemData | UseItemOnEntityData | ReleaseItemData | null,
    actions: InventoryAction[] = []
): InventoryTransactionPacket =>
    Object.assign(new InventoryTransactionPacket(), {
        legacyRequestId: 0,
        legacySlotChanges: [],
        transactionType: type,
        inventoryActions: actions,
        transactionData: data
    });

const handle = async (packet: InventoryTransactionPacket, world: ReturnType<typeof fake>) =>
    new InventoryTransactionHandler().handle(packet, world.server, world.session);

describe('InventoryTransactionHandler', () => {
    describe('rejectionReason', () => {
        it('accepts what a client sends', () => {
            expect(rejectionReason(transaction(TransactionType.USE_ITEM, useItem()))).toBeNull();
            expect(rejectionReason(transaction(TransactionType.USE_ITEM_ON_ENTITY, useItemOnEntity()))).toBeNull();
            expect(rejectionReason(transaction(TransactionType.RELEASE_ITEM, releaseItem()))).toBeNull();
            expect(rejectionReason(transaction(TransactionType.NORMAL, null))).toBeNull();
            expect(rejectionReason(transaction(TransactionType.MISMATCH, null))).toBeNull();
        });

        it('names a type the packet does not carry, as read off the wire', () => {
            const packet = transaction(TransactionType.NORMAL, null);
            // @ts-expect-error - 7 names no transaction type, which is the case under test:
            // the field is read off the wire, so any varint can land in it.
            packet.transactionType = 7;

            expect(rejectionReason(packet)).toBe('transaction type 7 is not one the packet may carry');
        });

        it('names an action source that does not exist, and knows the one that is 99999', () => {
            const action = (source: number) => new InventoryAction(source, null, null, 0, Item.air(), Item.air());

            expect(rejectionReason(transaction(TransactionType.NORMAL, null, [action(4)]))).toBe(
                'action source 4 does not exist'
            );
            expect(
                rejectionReason(
                    transaction(TransactionType.NORMAL, null, [action(InventorySourceType.NON_IMPLEMENTED_TODO)])
                )
            ).toBeNull();
        });

        it('wants the body the type selects, and no body for the types without one', () => {
            expect(rejectionReason(transaction(TransactionType.USE_ITEM, null))).toBe(
                'a USE_ITEM transaction has no body'
            );
            expect(rejectionReason(transaction(TransactionType.USE_ITEM, releaseItem()))).toBe(
                'a USE_ITEM transaction carries a release body'
            );
            expect(rejectionReason(transaction(TransactionType.NORMAL, useItem()))).toBe(
                'a NORMAL transaction carries a useItem body'
            );
        });

        it('holds each field against the docs', () => {
            const use = (overrides: Partial<UseItemData>) =>
                rejectionReason(transaction(TransactionType.USE_ITEM, useItem(overrides)));

            expect(use({ hotbarSlot: 9 })).toBe('hotbar slot 9 is outside the hotbar');
            expect(use({ hotbarSlot: -1 })).toBe('hotbar slot -1 is outside the hotbar');
            expect(use({ actionType: 4 })).toBe('item use action 4 does not exist');
            // @ts-expect-error - 2 names no hand; the guard rejecting it is the point.
            expect(use({ hand: 2 })).toBe('hand 2 does not exist');
            expect(use({ blockFace: 6 })).toBe("face 6 is not one of a block's six");
            expect(use({ blockFace: 255, actionType: ItemUseActionType.DESTROY })).toBeNull();
            expect(use({ clickPosition: new Vector3(Number.NaN, 0, 0) })).toBe('a position is not finite');

            expect(
                rejectionReason(transaction(TransactionType.USE_ITEM_ON_ENTITY, useItemOnEntity({ actionType: 3 })))
            ).toBe('item use on entity action 3 does not exist');
            expect(rejectionReason(transaction(TransactionType.RELEASE_ITEM, releaseItem({ actionType: 2 })))).toBe(
                'item release action 2 does not exist'
            );
        });
    });

    it('drops a transaction of a type it does not know at debug level, without throwing', async () => {
        const world = fake();
        const packet = transaction(TransactionType.USE_ITEM, null);
        // @ts-expect-error - 9 names no transaction type, which is what the handler must survive.
        packet.transactionType = 9;

        await expect(handle(packet, world)).resolves.toBeUndefined();

        expect(world.logged).toEqual([
            'debug: Dropped an inventory transaction from tester: transaction type 9 is not one the packet may carry'
        ]);
        expect(world.clicked).toEqual([]);
    });

    it("passes a click on to the content path with the server's hand, not what the client said it held", async () => {
        const world = fake();

        await handle(transaction(TransactionType.USE_ITEM, useItem()), world);

        expect(world.clicked).toEqual(['minecraft:stone at 0,62,0 face 1']);
    });

    it('refuses a face a block does not have before the world can trip on it', async () => {
        const world = fake();

        await handle(transaction(TransactionType.USE_ITEM, useItem({ blockFace: 6 })), world);

        expect(world.clicked).toEqual([]);
        expect(world.logged[0]).toContain("face 6 is not one of a block's six");
    });

    it('refuses a block out of reach of where the server has the player', async () => {
        const world = fake(Gametype.CREATIVE);
        const far = new BlockPosition(0, 64, 8);

        await handle(transaction(TransactionType.USE_ITEM, useItem({ blockPosition: far })), world);
        await handle(
            transaction(
                TransactionType.USE_ITEM,
                useItem({ blockPosition: far, actionType: ItemUseActionType.DESTROY })
            ),
            world
        );

        expect(world.clicked).toEqual([]);
        expect(world.broken).toEqual([]);
        expect(world.logged).toEqual([
            'verbose: Dropped item use PLACE from tester on a block 8.0 away',
            'verbose: Dropped item use DESTROY from tester on a block 8.0 away'
        ]);
    });

    it('refuses a hotbar slot that is not the one the server has selected', async () => {
        const world = fake();

        await handle(transaction(TransactionType.USE_ITEM, useItem({ hotbarSlot: 3 })), world);

        expect(world.clicked).toEqual([]);
        expect(world.logged).toEqual([
            'verbose: Dropped an inventory transaction from tester: it names hotbar slot 3 and the server has 2 selected'
        ]);
    });

    it('breaks a nearby block when survival says it did, with the client timing breaks', async () => {
        const world = fake();

        await handle(
            transaction(TransactionType.USE_ITEM, useItem({ actionType: ItemUseActionType.DESTROY, blockFace: 255 })),
            world
        );

        expect(world.broken).toEqual([new BlockPosition(0, 62, 0)]);
    });

    it('breaks nothing on a transaction when the server times breaks', async () => {
        // The client reports a break as `PREDICT_DESTROY_BLOCK` in that mode. A transaction
        // saying a block broke skipped the mining the server is timing.
        const world = fake(Gametype.SURVIVAL, undefined, { serverAuthoritativeBreaking: true });

        await handle(
            transaction(TransactionType.USE_ITEM, useItem({ actionType: ItemUseActionType.DESTROY, blockFace: 255 })),
            world
        );

        expect(world.broken).toEqual([]);
        expect(world.logged).toEqual([
            'verbose: Dropped a block break transaction from tester: block breaking is server-authoritative'
        ]);
    });

    it('starts the bow clock on a click at nothing, and only for a bow', async () => {
        const withBow = fake(Gametype.SURVIVAL, new Item({ runtimeId: 2, name: 'minecraft:bow' }));
        const withStone = fake();
        const clickAir = () => transaction(TransactionType.USE_ITEM, useItem({ actionType: ItemUseActionType.USE }));

        await handle(clickAir(), withBow);
        await handle(clickAir(), withStone);

        expect(withBow.itemUse).toEqual([`begin ${TICK}`]);
        expect(withStone.itemUse).toEqual([]);
    });

    it('swings at the entity the runtime id names, with the damage of the item the server holds', async () => {
        const world = fake();
        vi.mocked(meleeAttack).mockClear();

        await handle(transaction(TransactionType.USE_ITEM_ON_ENTITY, useItemOnEntity()), world);

        expect(vi.mocked(meleeAttack)).toHaveBeenCalledTimes(1);
        const [attacker, target, options] = vi.mocked(meleeAttack).mock.calls[0]!;
        expect(attacker).toBe(world.player);
        expect(target).toBe(world.zombie);
        expect(options).toMatchObject({ reach: 3, damage: 1, critical: false, knockbackLevels: 0 });
        expect(world.exhaustion()).toBeCloseTo(0.1);
    });

    it('drops a swing at a runtime id the world does not track, at verbose level', async () => {
        const world = fake();
        vi.mocked(meleeAttack).mockClear();

        await handle(transaction(TransactionType.USE_ITEM_ON_ENTITY, useItemOnEntity({ entityRuntimeId: 43n })), world);

        expect(vi.mocked(meleeAttack)).not.toHaveBeenCalled();
        expect(world.logged).toEqual(['verbose: tester swung at runtime id 43, which is not an entity here']);
    });

    it('does not swing on an interact', async () => {
        const world = fake();
        vi.mocked(meleeAttack).mockClear();

        await handle(
            transaction(
                TransactionType.USE_ITEM_ON_ENTITY,
                useItemOnEntity({ actionType: ItemUseOnActorActionType.INTERACT })
            ),
            world
        );

        expect(vi.mocked(meleeAttack)).not.toHaveBeenCalled();
    });

    it('routes an item interaction on an entity through content', async () => {
        const world = fake(Gametype.SURVIVAL, new Item({ runtimeId: 2, name: 'minecraft:sheep_spawn_egg' }));

        await handle(
            transaction(
                TransactionType.USE_ITEM_ON_ENTITY,
                useItemOnEntity({ actionType: ItemUseOnActorActionType.ITEM_INTERACT })
            ),
            world
        );

        expect(world.logged).toEqual([]);
        expect(world.entityInteractions).toEqual([42]);
        expect(vi.mocked(meleeAttack)).not.toHaveBeenCalled();
    });

    it('looses an arrow for as long as the bow was drawn, and nothing for a stone', async () => {
        const withBow = fake(Gametype.SURVIVAL, new Item({ runtimeId: 2, name: 'minecraft:bow' }));
        const withStone = fake();
        vi.mocked(loose).mockClear();

        await handle(transaction(TransactionType.RELEASE_ITEM, releaseItem()), withBow);
        await handle(transaction(TransactionType.RELEASE_ITEM, releaseItem()), withStone);

        expect(vi.mocked(loose)).toHaveBeenCalledTimes(1);
        expect(vi.mocked(loose)).toHaveBeenCalledWith(withBow.player, 15);
        // The clock is taken either way, so a release with nothing to fire still ends the use.
        expect(withStone.itemUse).toEqual([`take ${TICK}`]);
    });

    it('refuses everything from a spectator', async () => {
        const world = fake(Gametype.SPECTATOR);
        vi.mocked(meleeAttack).mockClear();

        await handle(transaction(TransactionType.USE_ITEM, useItem()), world);
        await handle(transaction(TransactionType.USE_ITEM_ON_ENTITY, useItemOnEntity()), world);

        expect(world.clicked).toEqual([]);
        expect(vi.mocked(meleeAttack)).not.toHaveBeenCalled();
    });

    it('logs a Normal transaction and applies none of its actions', async () => {
        const world = fake();
        const actions = [
            new InventoryAction(InventorySourceType.CONTAINER, 0, null, 2, Item.air(), Item.air()),
            new InventoryAction(InventorySourceType.WORLD, null, 0, 0, Item.air(), Item.air())
        ];

        await handle(transaction(TransactionType.NORMAL, null, actions), world);

        expect(world.inventory.getItemInHand().getName()).toBe('minecraft:stone');
        expect(world.logged).toEqual([
            'debug: Ignored a Normal inventory transaction from tester with 2 actions (CONTAINER, WORLD); item moves go through ItemStackRequest'
        ]);
    });

    it('drops the item a balanced Normal transaction removes from inventory', async () => {
        const world = fake();
        const held = new Item({ runtimeId: 1, name: 'minecraft:stone', count: 3 });
        world.inventory.setItem(2, new ContainerEntry({ item: held, count: 3 }));

        await handle(
            transaction(TransactionType.NORMAL, null, [
                new InventoryAction(InventorySourceType.CONTAINER, 0, null, 2, held, held.withCount(2)),
                new InventoryAction(InventorySourceType.WORLD, null, 0, 0, Item.air(), held.withCount(1))
            ]),
            world
        );

        expect(world.inventory.getItem(2).getAmount()).toBe(2);
        expect(world.dropped.map((item) => [item.getName(), item.getAmount()])).toEqual([['minecraft:stone', 1]]);
        expect(world.inventorySyncs).toEqual([
            [0, ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY, 2, world.inventory.getItem(2)]
        ]);
    });

    it('ignores a Normal drop whose inventory and world changes do not balance', async () => {
        const world = fake();
        const held = new Item({ runtimeId: 1, name: 'minecraft:stone', count: 3 });
        world.inventory.setItem(2, new ContainerEntry({ item: held, count: 3 }));

        await handle(
            transaction(TransactionType.NORMAL, null, [
                new InventoryAction(InventorySourceType.CONTAINER, 0, null, 2, held, held.withCount(2)),
                new InventoryAction(InventorySourceType.WORLD, null, 0, 0, Item.air(), held.withCount(2))
            ]),
            world
        );

        expect(world.inventory.getItem(2).getAmount()).toBe(3);
        expect(world.dropped).toEqual([]);
        expect(world.inventorySyncs).toEqual([]);
    });

    it('takes a mismatch report as ordinary traffic', async () => {
        const world = fake();

        await handle(transaction(TransactionType.MISMATCH, null), world);

        expect(world.logged).toEqual(['verbose: tester reported an inventory mismatch']);
    });
});
