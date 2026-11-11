/**
 * The slice 5 target of the entity and tick re-architecture: no `Entity`, `GenericEntity`,
 * `Human` or `Player` class, and no array copy through `all()` or `getEntities()`.
 *
 * A player is a store player and every other entity is a store entity, so the server holds one
 * kind of entity and one kind of actor. These checks fail if a legacy class comes back, if an
 * actor subclass appears beside the store's own, or if a pass over the store copies it again.
 * They count and read structure, never a duration. `noMirror.test.ts` is the slice 4 target.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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

    it('declare no Entity and no Player', () => {
        expect(modulesMatching(/^export (?:default )?(?:abstract )?class (?:Entity|Player)\b/m)).toEqual([]);
        expect(existsSync(join(SOURCE, 'entity/Entity.ts'))).toBe(false);
        expect(existsSync(join(SOURCE, 'Player.ts'))).toBe(false);
    });

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
    it('copy no array of it through all() anywhere in the server', () => {
        // The entity pass, the despawn cycle, the cured-villager count, the actor sync and the
        // content's entity queries walk the store with `entities()`.
        expect(modulesMatching(/\b(?:this|runtime)\.all\(\)/)).toEqual([]);
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

    it('leave no all() on the runtime and no getEntities() on the world', () => {
        const { runtime } = entityFixture(new TestEntityWorld());

        expect('all' in runtime).toBe(false);
        expect(modulesMatching(/\bgetEntities\(\)/)).toEqual([]);
    });
});
