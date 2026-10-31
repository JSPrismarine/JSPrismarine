import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import { stub } from '../testing/stub.test.helper';
import type { World } from '../world/World';
import { PORTAL_TRANSITION_TICKS, PortalContact } from './PortalContact';

const origin = new Vector3(0, 64, 0);

/** Stands in the portal for `ticks` ticks and reports whether the last tick reached the delay. */
const standInside = (contact: PortalContact, ticks: number, delay: number): boolean => {
    let ready = false;
    for (let i = 0; i < ticks; i++) {
        contact.touch(origin);
        ready = contact.tick(delay);
    }
    return ready;
};

describe('entity', () => {
    describe('PortalContact', () => {
        it('reaches the survival delay after 80 ticks inside and not before', () => {
            const contact = new PortalContact(origin);

            expect(standInside(contact, 79, PORTAL_TRANSITION_TICKS.player)).toBe(false);
            expect(standInside(contact, 1, PORTAL_TRANSITION_TICKS.player)).toBe(true);
        });

        it('fires on the first tick when the delay is zero', () => {
            const contact = new PortalContact(origin);

            expect(standInside(contact, 1, PORTAL_TRANSITION_TICKS.creative)).toBe(true);
        });

        it('decays by four for every tick spent outside', () => {
            const contact = new PortalContact(origin);
            standInside(contact, 20, PORTAL_TRANSITION_TICKS.player);

            expect(contact.tick(PORTAL_TRANSITION_TICKS.player)).toBe(false);
            expect(contact.getPortalTime()).toBe(16);
            expect(contact.hasExpired()).toBe(false);

            for (let i = 0; i < 4; i++) contact.tick(PORTAL_TRANSITION_TICKS.player);
            expect(contact.getPortalTime()).toBe(0);
            expect(contact.hasExpired()).toBe(true);
        });

        it('counts a tick inside only once however often it is touched', () => {
            const contact = new PortalContact(origin);
            contact.touch(origin);
            contact.touch(new Vector3(1, 64, 0));

            contact.tick(PORTAL_TRANSITION_TICKS.player);

            expect(contact.getPortalTime()).toBe(1);
        });

        it('remembers where the entity last stood in the portal', () => {
            const contact = new PortalContact(origin);
            const moved = new Vector3(3, 65, -2);

            contact.touch(moved);

            expect(contact.getEntryPosition()).toBe(moved);
        });

        it('keeps the portal block of the last touch that named one', () => {
            const contact = new PortalContact(origin);
            const portal = { world: stub<World>(), position: new Vector3(0, 64, 0), block: 'minecraft:portal' };

            expect(contact.getPortal()).toBeUndefined();
            contact.touch(origin, portal);
            contact.touch(origin);

            expect(contact.getPortal()).toBe(portal);
        });

        it('has nothing to say when it was just created', () => {
            const contact = new PortalContact(origin);

            expect(contact.getPortalTime()).toBe(0);
            expect(contact.hasExpired()).toBe(true);
        });
    });
});
