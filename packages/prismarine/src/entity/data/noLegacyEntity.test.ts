/**
 * The slice 5 target of the entity and tick re-architecture: no `Entity`, `GenericEntity` or
 * `Human` class, and no array copy through `all()`.
 *
 * A player is a store player and every other entity is a store entity, so the server holds one
 * kind of entity and one kind of actor. These checks fail if a legacy class comes back, if an
 * actor subclass appears beside the store's own, or if a pass over the store copies it again.
 * They count and read structure, never a duration. `noMirror.test.ts` is the slice 4 target.
 *
 * Two checks wait for H-D, which deletes `Entity` and moves the last callers off `all()`. They
 * are `it.todo` until then, and become the assertions beside them.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import { entityFixture, TestEntityWorld } from './testing';

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

/** The source modules whose text matches, relative to `src`. */
const modulesMatching = (pattern: RegExp): string[] =>
    modulesIn(SOURCE)
        .filter((path) => pattern.test(readFileSync(path, 'utf8')))
        .map((path) => relative(SOURCE, path));

const GROUND = { x: 0, y: 1, z: 0 };

describe('the legacy entity classes', () => {
    it('declare no GenericEntity and no Human', () => {
        expect(modulesMatching(/^export (?:abstract )?class (?:GenericEntity|Human)\b/m)).toEqual([]);
        expect(existsSync(join(SOURCE, 'entity/Human.ts'))).toBe(false);
    });

    // H-D deletes `entity/Entity.ts` with `Player`, and this becomes
    // `expect(modulesMatching(/^export (?:abstract )?class Entity\b/m)).toEqual([])`.
    it.todo('declare no Entity, which H-D deletes with the legacy player');

    it('leave no class extending a legacy entity', () => {
        expect(modulesMatching(/class \w+ extends (?:Entity|GenericEntity|Human)\b/)).toEqual([]);
    });
});

describe('the actors', () => {
    it('are the store actor and the three the store builds', () => {
        const subclasses = modulesIn(SOURCE).flatMap((path) =>
            [...readFileSync(path, 'utf8').matchAll(/class (\w+) extends StoreActor\b/g)].map(
                (match) => `${relative(SOURCE, path)}: ${match[1]}`
            )
        );

        // A dropped stack, an actor no pack declares, and a player.
        expect(subclasses.sort()).toEqual([
            'entity/data/itemActor.ts: ItemActor',
            'entity/data/storeActors.ts: InertActor',
            'entity/data/storePlayers.ts: StorePlayerActor'
        ]);
    });
});

describe('the passes over the store', () => {
    it('copy no array of it through all() inside the runtime and the actors', () => {
        // The entity pass, the despawn cycle, the cured-villager count and the actor sync walk the
        // store with `entities()`.
        for (const module of ['entity/data/EntityRuntime.ts', 'entity/data/storeActors.ts']) {
            const text = readFileSync(join(SOURCE, module), 'utf8');
            expect(text.match(/\b(?:this|runtime)\.all\(\)/g) ?? [], module).toEqual([]);
        }
    });

    it('make no call to all() in a tick', () => {
        const { runtime } = entityFixture(new TestEntityWorld());
        for (const x of [0, 2, 4]) runtime.spawn('minecraft:cow', { ...GROUND, x });
        const all = vi.spyOn(runtime, 'all');

        for (let tick = 1; tick <= 3; tick += 1) runtime.tick(tick);
        runtime.tick(4, () => false);

        expect(all).not.toHaveBeenCalled();
    });

    it('walk the entities the store held when the walk began, in spawn order', () => {
        const { runtime } = entityFixture(new TestEntityWorld());
        const spawned = [0, 2, 4].map((x) => runtime.spawn('minecraft:cow', { ...GROUND, x }));
        const ids = spawned.map((entity) => entity?.id);

        const visited: number[] = [];
        for (const entity of runtime.entities()) {
            visited.push(entity.id);
            // An entity admitted mid-walk waits for the next one, as it did in the copy's pass.
            if (visited.length === 1) runtime.spawn('minecraft:cow', { ...GROUND, x: 6 });
        }

        expect(visited).toEqual(ids);
        expect([...runtime.entities()]).toHaveLength(4);
    });

    it('skip an entity removed before the walk reaches it', () => {
        const { runtime } = entityFixture(new TestEntityWorld());
        const [first, second, third] = [0, 2, 4].map((x) => runtime.spawn('minecraft:cow', { ...GROUND, x }));
        if (first === undefined || second === undefined || third === undefined) throw new Error('no cows');

        const visited: number[] = [];
        for (const entity of runtime.entities()) {
            visited.push(entity.id);
            if (entity === first) runtime.remove(second.id, 'test');
        }

        expect(visited).toEqual([first.id, third.id]);
    });

    // `all()` stays for the callers that need an array: `live.ts`, `DragonFight.ts`,
    // `contentAdapter.ts` and the tests. H-C1 and H-D move them to `entities()` or an index
    // query, and then `EntityRuntime.all` goes.
    it.todo('leave no all() on the runtime, which H-C1 and H-D empty of callers');
});
