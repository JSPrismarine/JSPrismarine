import { describe, expect, it } from 'vitest';

import { contentWorldViews } from '../../content/world/views';
import { singleDimension } from '../../content/world/adapter';
import { entityFixture, FLOOR_Y, TestEntityWorld } from './testing';

const GROUND = { x: 0, y: FLOOR_Y + 1, z: 0 };

/** A fixture with one player, so the spawner has somewhere to spawn around. */
const populated = () =>
    entityFixture(
        new TestEntityWorld({
            players: [{ id: 7, identifier: 'minecraft:player', position: GROUND }],
            random: [0.1, 0.4, 0.7, 0.2, 0.9, 0.5]
        })
    );

describe('spawn rules', () => {
    it('spawns what the rules ask for, through the same runtime a summon goes through', () => {
        const fixture = populated();
        const spawnWorld = contentWorldViews(singleDimension(fixture.adapter), () => fixture.content).spawnWorld;

        fixture.runtime.startSpawning(spawnWorld);
        fixture.runtime.tick(0);

        const spawned = fixture.runtime.all();
        expect(spawned.length).toBeGreaterThan(0);
        for (const entity of spawned) expect(entity.identifier).toBe('minecraft:cow');
    });

    it('counts what it spawned against the rule’s own population pool', () => {
        const fixture = populated();
        const spawnWorld = contentWorldViews(singleDimension(fixture.adapter), () => fixture.content).spawnWorld;

        fixture.runtime.startSpawning(spawnWorld);
        fixture.runtime.tick(0);

        expect(fixture.runtime.poolCount('animal')).toBe(fixture.runtime.all().length);
    });

    it('spawns nothing until the spawner is started', () => {
        const fixture = populated();

        fixture.runtime.tick(0);

        expect(fixture.runtime.all()).toEqual([]);
    });

    it('runs no cycle at all with doMobSpawning off', () => {
        const fixture = entityFixture(
            new TestEntityWorld({
                players: [{ id: 7, identifier: 'minecraft:player', position: GROUND }],
                random: [0.1, 0.4, 0.7, 0.2, 0.9, 0.5],
                gameRules: { doMobSpawning: false }
            })
        );
        const spawnWorld = contentWorldViews(singleDimension(fixture.adapter), () => fixture.content).spawnWorld;

        fixture.runtime.startSpawning(spawnWorld);
        fixture.runtime.tick(0);

        expect(fixture.runtime.all()).toEqual([]);
    });
});

describe('the despawn pass', () => {
    it('takes out a spawned mob that nobody is near any more', () => {
        const fixture = populated();
        const spawnWorld = contentWorldViews(singleDimension(fixture.adapter), () => fixture.content).spawnWorld;
        fixture.runtime.startSpawning(spawnWorld);

        // Well past the eight chunks `despawnRadiusChunks` allows, and in the pool a spawn
        // rule would have put it in.
        const far = { x: 4000, y: FLOOR_Y + 1, z: 0 };
        const cow = fixture.runtime.spawn('minecraft:cow', far, { pool: 'animal' });
        fixture.runtime.tick(1);

        expect(fixture.runtime.byId(cow!.id)).toBeUndefined();
        expect(fixture.removed.at(-1)).toEqual({ entity: cow, reason: 'simulation_edge' });
    });

    it('keeps a mob no spawn rule produced, however far away it is', () => {
        const fixture = populated();
        const spawnWorld = contentWorldViews(singleDimension(fixture.adapter), () => fixture.content).spawnWorld;
        fixture.runtime.startSpawning(spawnWorld);

        const bred = fixture.runtime.spawn('minecraft:cow', { x: 4000, y: FLOOR_Y + 1, z: 0 }, { cause: 'born' });
        fixture.runtime.tick(1);

        expect(fixture.runtime.byId(bred!.id)).toBe(bred);
    });
});

describe('trading', () => {
    it('builds a villager’s offers out of the table its component names', () => {
        const fixture = entityFixture();
        const villager = fixture.runtime.spawn('minecraft:villager_v2', GROUND);

        const merchant = fixture.runtime.merchant(villager!);

        expect(merchant?.offers().flatMap((live) => live.offer.gives.map((stack) => stack.item))).toEqual([
            'minecraft:emerald'
        ]);
    });

    it('keeps one merchant per villager, because its offers are drawn once', () => {
        const fixture = entityFixture();
        const villager = fixture.runtime.spawn('minecraft:villager_v2', GROUND);

        expect(fixture.runtime.merchant(villager!)).toBe(fixture.runtime.merchant(villager!));
    });

    it('gives no merchant to an entity that carries no trade table', () => {
        const fixture = entityFixture();
        const cow = fixture.runtime.spawn('minecraft:cow', GROUND);

        expect(fixture.runtime.merchant(cow!)).toBeUndefined();
    });
});
