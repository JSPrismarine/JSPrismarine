import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it, vi } from 'vitest';

import { testEntityServer } from '../testing/entityServer';
import { stub } from '../testing/stub.test.helper';
import { Position } from '../world/Position';
import type { World } from '../world/World';
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

            it('refuses a touch while on cooldown', () => {
                const { entity } = entityAt(0, 64, 0);
                entity.setPortalCooldown(10);

                entity.touchPortal(inPortal);

                expect(entity.isOnPortalCooldown()).toBe(true);
                expect(entity.portalContact()).toBeUndefined();
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
