import { describe, expect, it } from 'vitest';

import { contentWorldViews } from '../content/world/views';
import { singleDimension } from '../content/world/adapter';
import { entityFixture, FLOOR_Y, TestEntityWorld } from './data/testing';
import { dataEntityRecordOf } from './data/persistence';

const GROUND = { x: 0, y: FLOOR_Y + 1, z: 0 };

/** The views the content packages see, projected out of the assembled adapter. */
const viewsOf = (fixture: ReturnType<typeof entityFixture>) =>
    contentWorldViews(singleDimension(fixture.adapter), () => fixture.content);

describe('entityContentGroups', () => {
    describe('the entities group', () => {
        it('spawns through the data-driven runtime and hands back the runtime id', () => {
            const fixture = entityFixture();

            const id = fixture.adapter.entities.spawn('minecraft:cow', GROUND);

            expect(fixture.runtime.byId(id)?.identifier).toBe('minecraft:cow');
        });

        it('carries the entity payload through the runtime into its saved record', () => {
            const fixture = entityFixture();
            const data = { variant: 'warm', fuse: 37 };

            const id = fixture.adapter.entities.spawn('minecraft:cow', GROUND, data);
            const spawned = fixture.runtime.byId(id);
            if (spawned === undefined) throw new Error('the data-driven cow was not spawned');

            expect(dataEntityRecordOf(spawned, undefined).spawnData).toEqual(data);
        });

        it('finds what stands in one block and what stands near it', () => {
            const fixture = entityFixture();
            fixture.adapter.entities.spawn('minecraft:cow', GROUND);
            fixture.adapter.entities.spawn('minecraft:cow', { x: 6, y: FLOOR_Y + 1, z: 0 });

            expect(fixture.adapter.entities.at(GROUND)).toHaveLength(1);
            expect(fixture.adapter.entities.near(GROUND, 10)).toHaveLength(2);
            expect(fixture.adapter.entities.countOfType('minecraft:cow', GROUND, 3)).toBe(1);
        });

        it('reports the players the host knows about rather than the ones it indexed', () => {
            const world = new TestEntityWorld({
                players: [{ id: 7, identifier: 'minecraft:player', position: GROUND }]
            });
            const fixture = entityFixture(world);

            expect(fixture.adapter.entities.players()).toEqual(world.players);
        });

        it('removes an entity by its runtime id', () => {
            const fixture = entityFixture();
            const id = fixture.adapter.entities.spawn('minecraft:cow', GROUND);

            fixture.adapter.entities.remove(id);

            expect(fixture.runtime.byId(id)).toBeUndefined();
        });

        it('passes a drop straight to the subsystem that owns item entities', () => {
            const fixture = entityFixture();

            fixture.adapter.entities.drop(GROUND, { identifier: 'minecraft:wheat', count: 2 });

            expect(fixture.world.drops).toEqual([
                { position: GROUND, item: { identifier: 'minecraft:wheat', count: 2 } }
            ]);
        });
    });

    describe('the spawning group', () => {
        it('reads a site flag off the blocks rather than off a table', () => {
            const fixture = entityFixture();
            const { spawning } = fixture.adapter;

            expect(spawning?.site('surface', GROUND)).toBe(true);
            expect(spawning?.site('underground', { x: 0, y: FLOOR_Y - 4, z: 0 })).toBe(true);
            expect(spawning?.site('underwater', GROUND)).toBe(false);
        });

        it('calls a position underwater when the block there is water', () => {
            const world = new TestEntityWorld();
            world.setBlock(GROUND, 'minecraft:water');
            const fixture = entityFixture(world);

            expect(fixture.adapter.spawning?.site('underwater', GROUND)).toBe(true);
        });

        it('answers no to a medium the block at the position is not', () => {
            const fixture = entityFixture();

            expect(fixture.adapter.spawning?.site('lava', GROUND)).toBe(false);
            expect(fixture.adapter.spawning?.site('bubble_column', GROUND)).toBe(false);
            expect(fixture.adapter.spawning?.site('snow_covered', GROUND)).toBe(false);
        });

        it('counts a population pool out of the entities the spawner produced', () => {
            const fixture = entityFixture();
            fixture.runtime.spawn('minecraft:cow', GROUND, { pool: 'animal' });

            expect(fixture.adapter.spawning?.poolCount('animal')).toBe(1);
            expect(fixture.adapter.spawning?.poolCount('monster')).toBe(0);
        });

        it('leaves village distance out when the host cannot answer it', () => {
            const fixture = entityFixture();

            expect(fixture.adapter.spawning?.villageBorderDistance).toBeUndefined();
        });
    });

    describe('the ai group', () => {
        it('gives a goal mob a goal world and an actuator over its own body', () => {
            const fixture = entityFixture();
            const wanderer = fixture.runtime.spawn('jsprismarine:wanderer', GROUND);

            const actuator = fixture.adapter.ai?.actuator(wanderer!.instance);
            expect(actuator?.position()).toEqual(GROUND);
            expect(fixture.adapter.ai?.goalWorld(wanderer!.instance)).toBeDefined();
        });

        it('gives a brain mob no goal world, because it runs no goals', () => {
            const fixture = entityFixture();
            const goat = fixture.runtime.spawn('minecraft:goat', GROUND);

            expect(fixture.adapter.ai?.goalWorld(goat!.instance)).toBeUndefined();
        });

        it('hands out one brain world for the whole dimension', () => {
            const fixture = entityFixture();

            expect(fixture.adapter.ai?.brainWorld().dimension).toBe('minecraft:overworld');
        });
    });

    describe('through the content world views', () => {
        it('satisfies every projection the content packages were built against', () => {
            const world = new TestEntityWorld({
                players: [{ id: 7, identifier: 'minecraft:player', position: GROUND }]
            });
            const fixture = entityFixture(world);
            const views = viewsOf(fixture);

            // `SpawnWorld` is the one projection that reads all three of the groups this
            // subsystem owns, so it is the one that proves they fit together.
            expect(views.spawnWorld.players()).toEqual([{ position: GROUND }]);
            expect(views.spawnWorld.site('surface', GROUND)).toBe(true);
            expect(views.spawnWorld.poolCount('animal')).toBe(0);
            expect(views.brainWorld().dimension).toBe('minecraft:overworld');
        });
    });
});
