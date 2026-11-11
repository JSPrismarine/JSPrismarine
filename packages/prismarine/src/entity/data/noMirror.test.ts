/**
 * The slice 4 target of the entity and tick re-architecture: no mirror class and no health
 * comparison.
 *
 * A store entity reaches clients and the rest of the server through its `StoreActor`, which reads
 * the store and keeps no copy of it. The mirror was a legacy `Entity` per store entity, held in
 * the world's entity map and written from the store each tick. These checks fail if a class like
 * it comes back; `live.test.ts` checks the running world, which holds no store entity as a
 * legacy `Entity` and hands no health written onto an actor back to the store.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** The package's `src` directory. */
const SOURCE = fileURLToPath(new URL('../../', import.meta.url));

/** Every source module under a directory, tests and their helpers left out. */
const modulesIn = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return modulesIn(path);
        const isModule = entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts');
        return isModule && !/\.test(\.helper)?\.ts$/.test(entry.name) ? [path] : [];
    });

describe('the legacy mob bodies', () => {
    it('are gone', () => {
        expect(existsSync(join(SOURCE, 'entity/data/liveBodies.ts'))).toBe(false);
    });

    it('leave no legacy class over a store entity', () => {
        const wrappers = modulesIn(SOURCE)
            .filter((path) => {
                const text = readFileSync(path, 'utf8');
                return /class \w+ extends Entity\b/.test(text) && /\bDataEntity\b/.test(text);
            })
            .map((path) => relative(SOURCE, path));

        expect(wrappers).toEqual([]);
    });

    it('leave no subclass of the legacy entity', () => {
        // A dropped stack is an item actor, a saved actor no pack declares an inert one and a
        // player a store player's actor, all store actors, so nothing is a legacy entity.
        const subclasses = modulesIn(SOURCE)
            .filter((path) => /class \w+ extends Entity\b/.test(readFileSync(path, 'utf8')))
            .map((path) => relative(SOURCE, path));

        expect(subclasses).toEqual([]);
    });
});
