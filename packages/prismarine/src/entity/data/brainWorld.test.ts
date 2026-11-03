import { describe, expect, it, vi } from 'vitest';

import { definitionOf } from '../../content/ContentOptions';
import { brainEntityOf } from './brainWorld';
import { entityFixture, entityFixtureStack, FLOOR_Y, TestEntityWorld } from './testing';

describe('BrainWorld block tags', () => {
    it('resolves a block identifier tag set once per search', () => {
        const definitions = entityFixtureStack();
        const tags = new Map(definitions.tags);
        tags.set('block/jsp:solid', definitionOf('tags', 'block/jsp:solid', { values: ['minecraft:stone'] }));
        const fixture = entityFixture(new TestEntityWorld(), {
            load: () => ({ definitions: { ...definitions, tags }, diagnostics: [] })
        });
        const includes = vi.spyOn(fixture.content.tags, 'includes');
        const members = vi.spyOn(fixture.content.tags, 'members');
        let checks = 0;
        const observedTags = new Map<string, ReadonlySet<string>>();

        const found = fixture.runtime
            .brainWorld()
            .findBlock({ x: 0, y: FLOOR_Y, z: 0 }, 1, 1, (identifier, blockTags) => {
                checks += 1;
                observedTags.set(identifier, blockTags);
                return false;
            });

        expect(found).toBeUndefined();
        expect(checks).toBe(27);
        expect(observedTags.get('minecraft:stone')?.has('jsp:solid')).toBe(true);
        expect(observedTags.get('minecraft:air')?.has('jsp:solid')).toBe(false);
        expect(members).not.toHaveBeenCalled();
        expect(includes).toHaveBeenCalledTimes(2);
    });

    it('finds the nearest matching block in Java Manhattan order and only accepts supported air', () => {
        const world = new TestEntityWorld();
        world.setBlock({ x: 0, y: FLOOR_Y - 1, z: 0 }, 'minecraft:soul_fire');
        world.setBlock({ x: 0, y: FLOOR_Y + 1, z: 1 }, 'minecraft:soul_fire');
        world.setBlock({ x: 0, y: FLOOR_Y + 1, z: -1 }, 'minecraft:soul_fire');
        world.setBlock({ x: -1, y: FLOOR_Y + 1, z: 0 }, 'minecraft:stone');
        const fixture = entityFixture(world);
        const brainWorld = fixture.runtime.brainWorld();

        const found = brainWorld.findBlock(
            { x: 0, y: FLOOR_Y + 1, z: 0 },
            1,
            2,
            (identifier) => identifier === 'minecraft:soul_fire'
        );

        expect(found).toEqual({ x: 0, y: FLOOR_Y + 1, z: 1 });
        expect(brainWorld.canStandAt({ x: 0, y: FLOOR_Y + 1, z: 0 })).toBe(true);
        expect(brainWorld.canStandAt({ x: -1, y: FLOOR_Y + 1, z: 0 })).toBe(false);
    });

    it('queries entity and player collision boxes at AABB corners and stops beyond one face', () => {
        const player = {
            id: 99,
            identifier: 'minecraft:player',
            position: { x: 3.5, y: FLOOR_Y + 1, z: 12 }
        };
        const world = new TestEntityWorld({ players: [player] });
        const fixture = entityFixture(world);
        const goat = fixture.runtime.spawn('minecraft:goat', { x: 15.5, y: FLOOR_Y + 1, z: 0 });
        const corner = fixture.runtime.spawn('minecraft:cow', { x: 27.5, y: FLOOR_Y + 1, z: 12 });
        const edge = fixture.runtime.spawn('minecraft:cow', { x: 32.1, y: FLOOR_Y + 1, z: 0 });
        const outside = fixture.runtime.spawn('minecraft:cow', { x: 32.5, y: FLOOR_Y + 1, z: 0 });
        if (goat === undefined || corner === undefined || edge === undefined || outside === undefined) {
            throw new Error('the fixture must declare a goat and cows');
        }

        const found = fixture.runtime
            .brainWorld()
            .livingEntitiesNear(goat.position, 16, brainEntityOf(goat, fixture.runtime), goat.facts.box);

        expect(found.map(({ id }) => id).sort()).toEqual(
            [String(corner.id), String(edge.id), String(player.id)].sort()
        );
    });
});
