import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it, vi } from 'vitest';

import { testEntityServer } from '../testing/entityServer';
import { stub } from '../testing/stub.test.helper';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import { DamageCause } from './DamageCause';
import { Entity } from './Entity';

const entityAt = (x: number, y: number, z: number) => {
    const broadcastMove = vi.fn<World['broadcastMove']>(async () => {});
    const world = stub<World>({
        getName: () => 'test',
        getServer: () => testEntityServer(),
        broadcastMove
    });
    return { entity: new Entity({ position: new Position(x, y, z, world) }), broadcastMove };
};

describe('entity', () => {
    describe('Entity', () => {
        it('stops allocating runtime ids before numeric map keys lose precision', () => {
            const previousCount = Entity.runtimeIdCount;
            Entity.runtimeIdCount = BigInt(Number.MAX_SAFE_INTEGER);

            try {
                expect(() => entityAt(0, 64, 0)).toThrow(RangeError);
            } finally {
                Entity.runtimeIdCount = previousCount;
            }
        });

        describe('setPosition', () => {
            it('moves the entity and tells the world', async () => {
                const { entity, broadcastMove } = entityAt(0, 64, 0);

                await entity.setPosition({ position: new Vector3(1.5, 70, -2.5) });

                expect(entity.getPosition().getX()).toBe(1.5);
                expect(entity.getPosition().getY()).toBe(70);
                expect(entity.getPosition().getZ()).toBe(-2.5);
                expect(broadcastMove).toHaveBeenCalledWith(entity, false);
            });

            // A NaN position used to be stored and broadcast, and only failed later, deep in
            // packet encoding, with the server already holding a position no client can show.
            it.each([
                [new Vector3(Number.NaN, 0, 0)],
                [new Vector3(0, Number.NaN, 0)],
                [new Vector3(0, 0, Number.NaN)],
                [new Vector3(Number.POSITIVE_INFINITY, 0, 0)],
                [new Vector3(0, Number.NEGATIVE_INFINITY, 0)]
            ])('refuses to move to %s and stays put', async (position) => {
                const { entity, broadcastMove } = entityAt(10, 64, 20);

                await expect(entity.setPosition({ position })).rejects.toThrow(RangeError);

                expect(entity.getPosition().getX()).toBe(10);
                expect(entity.getPosition().getY()).toBe(64);
                expect(entity.getPosition().getZ()).toBe(20);
                expect(broadcastMove).not.toHaveBeenCalled();
            });
        });

        describe('setHealth', () => {
            it('records what killed it when the write itself is the kill', async () => {
                const { entity } = entityAt(0, 64, 0);

                await entity.setHealth(0, DamageCause.SelfDestruct);

                // What `/kill` relies on: the data-entity mirror reads the last damage
                // source to tell the runtime what took the health, and a kill written
                // straight onto the attribute must not arrive there as generic damage.
                expect(entity.isAlive()).toBe(false);
                expect(entity.getLastDamageSource()?.cause).toBe(DamageCause.SelfDestruct);
            });

            it('records nothing for a write the entity survives', async () => {
                const { entity } = entityAt(0, 64, 0);

                await entity.setHealth(5);

                expect(entity.getLastDamageSource()).toBeNull();
            });
        });

        describe('portals', () => {
            const inPortal = new Vector3(0.5, 64, 0.5);

            it('starts with no cooldown and no portal contact', () => {
                const { entity } = entityAt(0, 64, 0);

                expect(entity.getPortalCooldown()).toBe(0);
                expect(entity.isOnPortalCooldown()).toBe(false);
                expect(entity.portalContact()).toBeUndefined();
            });

            it('opens a contact on the first touch and keeps it across touches', () => {
                const { entity } = entityAt(0, 64, 0);

                entity.touchPortal(inPortal);
                const contact = entity.portalContact();
                entity.touchPortal(inPortal);

                expect(contact).toBeDefined();
                expect(entity.portalContact()).toBe(contact);
            });

            it('opens no contact for a touch while on cooldown, winding the cooldown back to its full length', () => {
                const { entity } = entityAt(0, 64, 0);
                entity.setPortalCooldown(10);

                entity.touchPortal(inPortal);

                expect(entity.isOnPortalCooldown()).toBe(true);
                expect(entity.portalContact()).toBeUndefined();
                // Java's `Entity.setAsInsidePortal`: standing in a portal on cooldown starts the
                // cooldown over, so travel needs leaving the portal and stepping back in.
                expect(entity.getPortalCooldown()).toBe(300);
            });

            it('waits 300 ticks by default, as a mob does in vanilla', () => {
                const { entity } = entityAt(0, 64, 0);

                entity.setPortalCooldown();

                expect(entity.getPortalCooldown()).toBe(300);
            });

            it('counts the cooldown down one per tick and stops at zero', async () => {
                const { entity } = entityAt(0, 64, 0);
                entity.setPortalCooldown(2);

                await entity.update(1);
                expect(entity.getPortalCooldown()).toBe(1);
                await entity.update(2);
                expect(entity.getPortalCooldown()).toBe(0);
                await entity.update(3);
                expect(entity.getPortalCooldown()).toBe(0);
                expect(entity.isOnPortalCooldown()).toBe(false);
            });

            it('advances the contact every tick and drops it once it has decayed', async () => {
                const { entity } = entityAt(0, 64, 0);

                entity.touchPortal(inPortal);
                await entity.update(1);
                expect(entity.portalContact()?.getPortalTime()).toBe(1);

                // Out of the portal: one tick of decay takes the single tick inside back to zero.
                await entity.update(2);
                expect(entity.portalContact()).toBeUndefined();
            });

            it('goes through on the first tick inside, which is the rule for anything but a player', () => {
                const { entity } = entityAt(0, 64, 0);

                expect(entity.getPortalTransitionTicks()).toBe(0);
            });
        });
    });
});
