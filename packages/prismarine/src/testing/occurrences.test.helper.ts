/**
 * Occurrences as the change log holds them, for tests of the code that logs them and of the
 * replicator that sends them.
 */
import type { Logger } from '@jsprismarine/logger';

import type { EntityStore } from '../entity/data/EntityStore';
import type Server from '../Server';
import type { ChangeEntry, OccurrenceEntry } from '../world/changelog/ChangeEntry';
import type { SealedTick } from '../world/changelog/ChangeLog';
import BlockUpdateScheduler from '../world/BlockUpdateScheduler';
import { Dimensions } from '../world/DimensionType';
import { World } from '../world/World';
import type { WorldChangeSink } from '../world/WorldChangeSink';
import { NULL_WORLD_CHANGE_SINK } from '../world/WorldChangeSink';
import { inertEntityRuntime } from './entityServer';
import { stub } from './stub.test.helper';

let ticks = 0;

const isOccurrence = (entry: ChangeEntry): entry is OccurrenceEntry => entry.kind === 'occurrence';

/** Hands a sink one sealed tick of these occurrences, numbered after every tick this helper made before. */
export const sealOccurrences = (sink: Pick<WorldChangeSink, 'tickSealed'>, ...entries: OccurrenceEntry[]): void => {
    const sealed: SealedTick = { tick: ++ticks, entries };
    sink.tickSealed(sealed);
};

/**
 * A world double built on the prototype, whose occurrences go into a real store's change log, as
 * a ticking world's do.
 * @param members - The world's members the code under test reads, over the double's own.
 * @returns The world, its store, and `occurrences`, which seals the open tick, opens the next and
 *   returns the sealed tick's occurrences in order.
 */
export const occurrenceWorld = (members: object = {}) => {
    const runtime = inertEntityRuntime();
    const store: EntityStore = runtime.runtime.store;
    store.beginTick();
    const verbose: string[] = [];
    const world: World = Object.assign(
        Object.create(World.prototype),
        {
            changes: NULL_WORLD_CHANGE_SINK,
            dimension: Dimensions.Overworld,
            // The journal a world registers on its store with its log.
            blockUpdates: new BlockUpdateScheduler(),
            server: stub<Server>({
                getEntityRuntime: () => runtime,
                hasEntityRuntime: () => true,
                getLogger: () => stub<Logger>({ verbose: (message: string) => void verbose.push(message) })
            })
        },
        members
    );
    const occurrences = (): OccurrenceEntry[] => {
        const entries = store.sealTick()?.entries ?? [];
        store.beginTick();
        return entries.filter(isOccurrence);
    };
    return { world, store, occurrences, verbose };
};
