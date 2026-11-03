import { describe, expect, it, vi } from 'vitest';

import { definitionOf } from '../../content/ContentOptions';
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

    it('finds the first matching block in Java Manhattan order and only accepts supported air', () => {
        const world = new TestEntityWorld();
        world.setBlock({ x: -1, y: FLOOR_Y + 1, z: 0 }, 'minecraft:stone');
        world.setBlock({ x: 1, y: FLOOR_Y + 1, z: 0 }, 'minecraft:stone');
        const fixture = entityFixture(world);
        const brainWorld = fixture.runtime.brainWorld();

        const found = brainWorld.findBlock(
            { x: 0, y: FLOOR_Y + 1, z: 0 },
            1,
            1,
            (identifier) => identifier === 'minecraft:stone',
            'manhattan'
        );

        expect(found).toEqual({ x: -1, y: FLOOR_Y + 1, z: 0 });
        expect(brainWorld.canStandAt({ x: 0, y: FLOOR_Y + 1, z: 0 })).toBe(true);
        expect(brainWorld.canStandAt({ x: -1, y: FLOOR_Y + 1, z: 0 })).toBe(false);
    });
});
