/**
 * A store player outside and inside the store: it outlives its entity, holds what the entity
 * held while it is in no store, logs nothing then, and once attached logs every component, hand
 * slot and carried slot write, which the runtime undoes. Asserted as state and change log entries.
 */
import { Gametype } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import ContainerEntry from '../inventory/ContainerEntry';
import { Item } from '../item/Item';
import {
    enteredStorePlayer,
    fieldsOf,
    logged,
    loggedInStorePlayer,
    STORE_PLAYER_FEET,
    storePlayerFixture
} from '../testing/storePlayer.test.helper';
import type { ChangeEntry } from '../world/changelog/ChangeEntry';
import { enterStore, leaveStore, StorePlayers } from './data/storePlayers';
import type { EntityFixture } from './data/testing';
import { FLOOR_Y } from './data/testing';

const slotEntries = (entries: readonly ChangeEntry[]) =>
    entries.filter((entry) => entry.kind === 'field' && entry.field === 'inventory-slot');

const diamonds = (count: number) => new ContainerEntry({ item: new Item({ name: 'minecraft:diamond', count }), count });

/** Runs `work` in a unit of its own tick that throws, so the store undoes what it wrote. */
const undone = (fixture: EntityFixture, work: () => void) => {
    fixture.runtime.store.beginTick();
    const outcome = fixture.runtime.store.unit(() => {
        work();
        throw new Error('undo it');
    });
    fixture.runtime.store.sealTick();
    expect(outcome.failed).toBe(true);
    expect(fixture.runtime.store.broken).toBeUndefined();
};

describe('a store player', () => {
    describe('in no store', () => {
        it('holds its position, look and health, and logs nothing', () => {
            const fixture = storePlayerFixture();
            const player = loggedInStorePlayer(fixture);

            const entries = logged(fixture.runtime, () => {
                player.restoreHealth(7);
                player.setFood(3);
                player.getInventory().setItem(0, diamonds(2));
                player.placeAt({ x: 4.5, y: FLOOR_Y + 1 + 1.62, z: 2.5, yaw: 90, pitch: 10, headYaw: 45 });
            });

            expect(player.entity).toBeUndefined();
            expect(entries).toEqual([]);
            expect(player.getHealth()).toBe(7);
            expect(player.getPosition().getX()).toBe(4.5);
            expect([player.yaw, player.pitch, player.headYaw]).toEqual([90, 10, 45]);
        });

        it('enters a store with what it held, under its own id, as one membership entry', () => {
            const fixture = storePlayerFixture();
            const player = loggedInStorePlayer(fixture);
            player.restoreHealth(7);
            player.setFood(3);

            const entries = logged(fixture.runtime, () => {
                enterStore(fixture.runtime, new StorePlayers(), player);
            });

            const { entity } = player;
            expect(entity?.id).toBe(player.id);
            expect(entity?.position).toEqual(STORE_PLAYER_FEET);
            expect(entity?.body.nameTag).toBe('Steve');
            expect(entity?.instance.attributes.get('health')?.current).toBe(7);
            expect(player.getFood()).toBe(3);
            expect(entries.map((entry) => entry.kind)).toEqual(['membership']);
        });
    });

    describe('between two stores', () => {
        it('leaves one store and enters another with the same id, health and tags', () => {
            const overworld = storePlayerFixture();
            const nether = storePlayerFixture();
            const players = new StorePlayers();
            const { player, entity } = enteredStorePlayer(overworld);
            entity.body.tags.add('traveler');
            player.restoreHealth(9);

            const left = logged(overworld.runtime, () =>
                expect(leaveStore(overworld.runtime, player, 'changed dimension')).toBe(true)
            );

            expect(player.entity).toBeUndefined();
            expect(overworld.runtime.store.has(player.id)).toBe(false);
            expect(left.map((entry) => entry.kind)).toEqual(['membership']);
            expect(player.getHealth()).toBe(9);

            const arrived = enterStore(nether.runtime, players, player);

            expect(arrived?.id).toBe(player.id);
            expect(nether.runtime.store.get(player.id)).toBe(arrived);
            expect(arrived?.instance.attributes.get('health')?.current).toBe(9);
            expect([...(arrived?.body.tags ?? [])]).toEqual(['traveler']);
            expect(players.of(player.id)).toBe(player);
        });

        it('runs its survival in the store it entered, on the same components', () => {
            const overworld = storePlayerFixture();
            const nether = storePlayerFixture();
            const { player } = enteredStorePlayer(overworld);
            leaveStore(overworld.runtime, player, 'changed dimension');
            player.setFood(0);
            const entity = enterStore(nether.runtime, new StorePlayers(), player)!;

            logged(nether.runtime, () => nether.runtime.tick(80));

            expect(nether.runtime.playerSystems.componentsOf(entity)).toBe(player.getComponents());
            expect(player.getHealth()).toBe(19);
        });
    });

    describe('in a store', () => {
        it('logs a write to a carried slot as one inventory-slot entry, and the runtime undoes it', () => {
            const fixture = storePlayerFixture();
            const { player } = enteredStorePlayer(fixture);
            const inventory = player.getInventory();

            const entries = logged(fixture.runtime, () => inventory.setItem(4, diamonds(3)));
            expect(slotEntries(entries)).toHaveLength(1);
            expect(slotEntries(entries)[0]).toMatchObject({
                address: { entity: BigInt(player.id), container: 'inventory', slot: 4 },
                before: null
            });

            undone(fixture, () => {
                inventory.setItem(4, diamonds(5));
                inventory.getArmor().setItem(0, diamonds(1));
            });
            expect(inventory.getItem(4).getAmount()).toBe(3);
            expect(inventory.getArmor().getItem(0).getName()).toBe('minecraft:air');
        });

        it('logs and undoes the hand slot and the crafting grid', () => {
            const fixture = storePlayerFixture();
            const { player } = enteredStorePlayer(fixture);
            const inventory = player.getInventory();

            const entries = logged(fixture.runtime, () => {
                inventory.setHandSlot(2);
                player.getCraftingInput().set(1, new Item({ name: 'minecraft:stick' }));
            });
            expect(fieldsOf(entries, 'inventory.handSlot')).toHaveLength(1);
            expect(slotEntries(entries)).toMatchObject([{ address: { container: 'crafting', slot: 1 } }]);

            undone(fixture, () => {
                inventory.setHandSlot(5);
                player.getCraftingInput().set(1, null);
            });
            expect(inventory.getHandSlotIndex()).toBe(2);
            expect(player.getCraftingInput().get(1)?.getName()).toBe('minecraft:stick');
        });

        it('stops logging once it left the store', () => {
            const fixture = storePlayerFixture();
            const { player } = enteredStorePlayer(fixture);
            leaveStore(fixture.runtime, player, 'changed dimension');

            const entries = logged(fixture.runtime, () => {
                player.getInventory().setItem(0, diamonds(1));
                player.setFood(1);
            });

            expect(entries).toEqual([]);
        });
    });

    describe("through the runtime's player inputs", () => {
        const mining = { x: 1, y: FLOOR_Y, z: 0, face: 1, runtimeId: 7, progressPerTick: 0.1 };

        it('logs each input in the store it is in, as one entry for its field', () => {
            const fixture = storePlayerFixture();
            const { player } = enteredStorePlayer(fixture);
            const { runtime } = fixture;

            const entries = logged(runtime, () => {
                runtime.setPlayerMining(player, mining);
                runtime.setPlayerSprinting(player, true);
                runtime.setPlayerSneaking(player, true);
                runtime.setPlayerGamemode(player, Gametype.CREATIVE);
                runtime.setPlayerFlying(player, true);
            });

            for (const field of [
                'mining.block',
                'movement.sprinting',
                'movement.sneaking',
                'abilities.gamemode',
                'abilities.flying'
            ])
                expect(fieldsOf(entries, field)).toHaveLength(1);
            expect(player.gamemode).toBe(Gametype.CREATIVE);
            expect(player.isFlying()).toBe(true);
        });

        it('writes onto the components and logs nothing while it is in no store', () => {
            const fixture = storePlayerFixture();
            const player = loggedInStorePlayer(fixture);
            const { runtime } = fixture;

            const entries = logged(runtime, () => {
                runtime.setPlayerMining(player, mining);
                runtime.setPlayerSprinting(player, true);
                runtime.setPlayerGamemode(player, Gametype.CREATIVE);
                runtime.cancelPlayerMeal(player);
                runtime.exhaustPlayer(player, 40);
                expect(runtime.beginPlayerMeal(player, 32)).toBe(false);
                expect(runtime.revivePlayer(player)).toBe(false);
            });

            expect(entries).toEqual([]);
            expect(player.getComponents().get('mining.block')).toEqual(mining);
            expect(player.getComponents().get('movement.sprinting')).toBe(true);
            expect(player.gamemode).toBe(Gametype.CREATIVE);
            expect(player.getFood()).toBe(20);
        });

        it('writes a player in another store through its components, which that store logs', () => {
            const overworld = storePlayerFixture();
            const nether = storePlayerFixture();
            const { player, entity } = enteredStorePlayer(overworld);

            expect(nether.runtime.entityOfPlayer(player)).toBeUndefined();
            expect(overworld.runtime.entityOfPlayer(player)).toBe(entity);

            const entries = logged(overworld.runtime, () => nether.runtime.setPlayerSprinting(player, true));

            // The components are the player's own wherever they are written from, so the store
            // its entity is in hears the write.
            expect(fieldsOf(entries, 'movement.sprinting')).toHaveLength(1);
        });
    });
});
