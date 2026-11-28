import { describe, expect, it } from 'vitest';

import type { DataEntity } from '../../entity/data/DataEntity';
import type { EntityRuntime } from '../../entity/data/EntityRuntime';
import { entityFixture, FLOOR_Y, TestEntityWorld } from '../../entity/data/testing';
import { beginMeasuredTick } from '../../testing/changeTicks.test.helper';
import { runContentUse } from './contentUse';

class Planned extends Error {}

/** A cow in a store with a tick open, and a log that keeps what it is handed. */
const scene = (tickOpen = true) => {
    const { runtime } = entityFixture(new TestEntityWorld());
    const cow = runtime.spawn('minecraft:cow', { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
    if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');
    if (tickOpen) beginMeasuredTick(runtime.store);
    const logged: unknown[] = [];
    const world = { getEntityStore: () => runtime.store };
    const log = { error: (error: unknown) => void logged.push(error) };
    return { runtime, cow, logged, use: (use: () => 'handled' | 'declined') => runContentUse(world, log, use) };
};

/** A use that names the cow, as a name tag's `onUse` does, then throws. */
const namesThenThrows = (cow: DataEntity) => (): never => {
    cow.body.nameTag = 'Named';
    throw new Planned();
};

/** Applies `work` as the input step does: one unit of the store that must not fail. */
const asInput = (runtime: EntityRuntime, work: () => void) => {
    const outcome = runtime.store.unit(work);
    expect(outcome.failed).toBe(false);
};

describe('runContentUse', () => {
    it('undoes what a throwing behavior wrote while the input around it commits', () => {
        const { runtime, cow, logged, use } = scene();
        let result: string | undefined;

        asInput(runtime, () => {
            result = use(namesThenThrows(cow));
        });

        expect(result).toBe('declined');
        expect(cow.body.nameTag).toBeUndefined();
        expect(logged).toEqual([expect.any(Planned)]);
        expect(runtime.store.sealTick()?.entries).toEqual([]);
    });

    it('keeps what a behavior that returns wrote, and hands back its result', () => {
        const { runtime, cow, logged, use } = scene();
        let result: string | undefined;

        asInput(runtime, () => {
            result = use(() => {
                cow.body.nameTag = 'Named';
                return 'handled';
            });
        });

        expect(result).toBe('handled');
        expect(cow.body.nameTag).toBe('Named');
        expect(logged).toEqual([]);
    });

    it('logs and declines a throw with no tick open, which has nothing to undo from', () => {
        const { cow, logged, use } = scene(false);

        expect(use(namesThenThrows(cow))).toBe('declined');
        expect(logged).toEqual([expect.any(Planned)]);
    });
});
