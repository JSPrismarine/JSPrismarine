import { AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';
import { describe, expect, it } from 'vitest';

import { storeWorld } from '../../testing/storeWorld.test.helper';
import { DamageCause } from '../DamageCause';
import { ItemActor } from './itemActor';

/** A stack of three stone on the ground of a world over a real store, and its actor. */
const stoneStack = () => {
    const at = storeWorld();
    const entity = at.live.dropItem({ x: 0.5, y: 64, z: 0.5 }, { stack: { name: 'minecraft:stone', count: 3 } });
    const actor = entity === undefined ? undefined : at.live.actors.actorOf(entity.id);
    if (!(actor instanceof ItemActor)) throw new Error('the fixture declares no dropped item');
    return { ...at, actor };
};

describe('the actor of a dropped stack', () => {
    it('carries its stack', () => {
        const { actor } = stoneStack();

        expect(actor.getItem()?.getItem().getName()).toBe('minecraft:stone');
        expect(actor.getItem()?.getCount()).toBe(3);
    });

    it('is never said to be on the ground', () => {
        const { actor } = stoneStack();

        expect(actor.isOnGround()).toBe(false);
        // Reported a little above where it lies.
        expect(actor.getPosition().getY() - actor.getFeetY()).toBe(0.125);
    });

    it('projects no metadata, and keeps the default attributes the legacy body had', async () => {
        const { actor } = stoneStack();

        expect(actor.projectMetadata()).toEqual({ flags: [], properties: [] });
        expect(actor.attributes.getValue(AttributeIds.Health)).toBe(20);

        // A blow takes the store's health and leaves the attributes alone.
        expect(await actor.damage(1, DamageCause.Fire)).toBe(true);
        expect(actor.getHealth()).toBe(4);
        expect(actor.attributes.getValue(AttributeIds.Health)).toBe(20);
    });

    it('raises no plugin event when it is hurt', async () => {
        const { actor, server } = stoneStack();
        const posted: string[] = [];
        Object.assign(server, { post: ([name]: [string]) => void posted.push(name) });

        await actor.damage(5, DamageCause.Fire);

        expect(actor.entity.removed).toBeDefined();
        expect(posted).toEqual([]);
    });
});
