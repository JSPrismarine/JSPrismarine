/**
 * The actors a store made during a test, in the order it made them.
 *
 * A world tells its clients about an entity from the change log, so a test that only wants to
 * know what a world put into it, such as the stacks a broken block dropped, reads the store's
 * actors as they are made instead.
 */
import { vi } from 'vitest';

import { StoreActors } from '../entity/data/storeActors';
import type { StoreActor } from '../entity/data/storeActors';

/** The store's own `add`, taken before any test replaces it. */
const add = StoreActors.prototype.add;

/**
 * Collects every actor any store makes from now on into `added`, which the caller may empty.
 * Undone by `vi.restoreAllMocks`; a later call replaces an earlier one.
 */
export const collectAddedActors = (added: StoreActor[]): void => {
    vi.spyOn(StoreActors.prototype, 'add').mockImplementation(function (this: StoreActors, entity) {
        add.call(this, entity);
        const actor = this.actorOf(entity.id);
        if (actor !== undefined) added.push(actor);
    });
};
