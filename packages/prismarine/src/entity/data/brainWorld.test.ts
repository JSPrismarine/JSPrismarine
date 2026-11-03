import { describe, expect, it, vi } from 'vitest';
import { MemoryModuleTypes } from '@jsprismarine/entity-brains';

import { definitionOf } from '../../content/ContentOptions';
import { brainEntityOf, brainMobOf } from './brainWorld';
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
        const brainWorld = fixture.runtime.brainWorld();

        const found = brainWorld.findBlock({ x: 0, y: FLOOR_Y, z: 0 }, 1, 1, (identifier, blockTags) => {
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

        const stoneTags = observedTags.get('minecraft:stone');
        brainWorld.findBlock({ x: 0, y: FLOOR_Y, z: 0 }, 1, 1, () => false);
        expect(observedTags.get('minecraft:stone')).toBe(stoneTags);
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

        expect(found.map(({ id }) => id)).toEqual([String(edge.id), String(corner.id), String(player.id)]);
    });
});

describe('BrainWorld cached views', () => {
    it('reuses world, entity, and mob views while movement and held-item state stay live', () => {
        const definitions = entityFixtureStack();
        const tags = new Map(definitions.tags);
        tags.set('item/jsp:loved', definitionOf('tags', 'item/jsp:loved', { values: ['minecraft:gold_ingot'] }));
        const player = {
            id: 99,
            identifier: 'minecraft:player',
            position: { x: 8.5, y: FLOOR_Y + 1, z: 0.5 }
        };
        const fixture = entityFixture(new TestEntityWorld({ players: [player] }), {
            load: () => ({ definitions: { ...definitions, tags }, diagnostics: [] })
        });
        const goat = fixture.runtime.spawn('minecraft:goat', { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
        if (goat === undefined || goat.brain === undefined) throw new Error('the fixture must provide a goat brain');

        const firstWorld = fixture.runtime.brainWorld();
        expect(fixture.runtime.brainWorld()).toBe(firstWorld);
        const playerView = firstWorld.players()[0];
        if (playerView === undefined) throw new Error('the fixture must provide a player');
        expect(firstWorld.players()[0]).toBe(playerView);
        player.position = { x: 10.5, y: FLOOR_Y + 1, z: 0.5 };
        expect(playerView.position).toEqual(player.position);

        goat.carried = 'minecraft:gold_ingot';
        const view = brainEntityOf(goat, fixture.runtime);
        const mob = brainMobOf(goat, goat.brain, fixture.runtime);
        const includes = vi.spyOn(fixture.content.tags, 'includes');
        expect(brainEntityOf(goat, fixture.runtime)).toBe(view);
        expect(brainMobOf(goat, goat.brain, fixture.runtime)).toBe(mob);
        const item = mob.mainHandItem;
        expect(item?.tags.has('jsp:loved')).toBe(true);
        const itemTagChecks = includes.mock.calls.length;
        expect(mob.mainHandItem).toBe(item);
        expect(includes).toHaveBeenCalledTimes(itemTagChecks);
        expect(mob.typeTags).toBe(mob.typeTags);

        const target = fixture.runtime.spawn('minecraft:cow', { x: 2.5, y: FLOOR_Y + 1, z: 0.5 });
        if (target === undefined) throw new Error('the fixture must declare a cow');
        const targetView = brainEntityOf(target, fixture.runtime);
        goat.brain.setMemory(MemoryModuleTypes.NEAREST_LIVING_ENTITIES, [targetView]);
        target.position = { x: 5.5, y: FLOOR_Y + 1, z: 0.5 };
        expect(goat.brain.getMemory(MemoryModuleTypes.NEAREST_LIVING_ENTITIES)?.[0]?.position).toEqual(target.position);

        const initialPosition = view.position;
        const initialEyePosition = view.eyePosition;
        goat.position = { x: 3.5, y: FLOOR_Y + 2, z: 4.5 };
        expect(view.position).not.toBe(initialPosition);
        expect(view.position).toEqual(goat.position);
        expect(view.eyePosition).toBe(initialEyePosition);
        expect(view.eyePosition?.y).toBe(goat.position.y + goat.facts.box.height * 0.85);

        fixture.runtime.remove(goat.id, 'view cache test');
        expect(view.alive).toBe(false);
        expect(mob.alive).toBe(false);
    });

    it('refreshes family tags only when the active component set changes', () => {
        const fixture = entityFixture(
            new TestEntityWorld(),
            {},
            {
                'minecraft:goat': {
                    components: {
                        'minecraft:health': { value: 20, max: 20 },
                        'minecraft:movement': { value: 0.2 },
                        'minecraft:collision_box': { width: 0.9, height: 1.3 }
                    },
                    component_groups: {
                        initial: { 'minecraft:type_family': { family: ['before'] } },
                        changed: { 'minecraft:type_family': { family: ['after'] } }
                    },
                    events: {
                        'minecraft:entity_spawned': { add: { component_groups: ['initial'] } },
                        'jsprismarine:change_facts': {
                            remove: { component_groups: ['initial'] },
                            add: { component_groups: ['changed'] }
                        }
                    }
                }
            }
        );
        const entity = fixture.runtime.spawn('minecraft:goat', { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
        if (entity?.brain === undefined) throw new Error('the fixture must provide a goat brain');

        const view = brainEntityOf(entity, fixture.runtime);
        const mob = brainMobOf(entity, entity.brain, fixture.runtime);
        const initialTags = view.typeTags;
        expect(initialTags.has('before')).toBe(true);
        expect(mob.typeTags).toBe(initialTags);

        entity.instance.fire('jsprismarine:change_facts');
        fixture.runtime.tick(1);

        expect(mob.typeTags).not.toBe(initialTags);
        expect(mob.typeTags.has('after')).toBe(true);
    });
});
