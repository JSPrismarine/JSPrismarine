import { describe, expect, it } from 'vitest';

import { Activities, MemoryModuleTypes, entityTracker } from '@jsprismarine/entity-brains';
import type { FilterEntityView } from '@jsprismarine/entities';
import { vanillaItemDefinitions } from '@jsprismarine/items';

import { brainEntityOf, brainMobOf, tickBrainNavigation } from './brainWorld';
import { dataEntityRecordOf } from './persistence';
import { entityFixture, FLOOR_Y, TestEntityWorld } from './testing';

/** A runtime over the entity fixture, with the world a test can poke at. */
const runtimeOf = (world = new TestEntityWorld()) => entityFixture(world);

const brainGoatRuntime = (navigation: 'walk' | 'fly', world = new TestEntityWorld()) =>
    entityFixture(
        world,
        {},
        {
            'minecraft:goat': {
                components: {
                    'minecraft:health': { value: 10, max: 10 },
                    'minecraft:movement': { value: 2 },
                    'minecraft:collision_box': { width: 0.9, height: 1.3 },
                    [`minecraft:navigation.${navigation}`]: {}
                }
            }
        }
    );

const moverRuntime = (world = new TestEntityWorld()) =>
    entityFixture(
        world,
        {},
        {
            'jsprismarine:mover': {
                components: {
                    'minecraft:health': { value: 20, max: 20 },
                    'minecraft:movement': { value: 0.25 },
                    'minecraft:collision_box': { width: 0.6, height: 1.8 },
                    'minecraft:physics': {},
                    'minecraft:navigation.walk': { can_walk: true },
                    'minecraft:jump.static': { jump_power: 0.8 }
                }
            }
        }
    );

const GROUND = { x: 0, y: FLOOR_Y + 1, z: 0 };

describe('EntityRuntime', () => {
    describe('event effects', () => {
        it('routes data-defined sounds, particles, and vibrations through the world', () => {
            const world = new TestEntityWorld();
            const { runtime, reports } = entityFixture(
                world,
                {},
                {
                    'jsprismarine:effectful': {
                        components: { 'minecraft:health': { value: 20, max: 20 } },
                        events: {
                            'jsprismarine:world_effects': {
                                play_sound: { sound: 'mob.cow.say' },
                                emit_particle: { particle: 'minecraft:entity_effect' },
                                emit_vibration: { vibration: 'entity_interact' }
                            }
                        }
                    }
                }
            );
            const entity = runtime.spawn('jsprismarine:effectful', GROUND);
            if (entity === undefined) throw new Error('the fixture declares no entity with world effects');

            entity.instance.fire('jsprismarine:world_effects');
            runtime.tick(1);

            expect(world.sounds).toEqual(['mob.cow.say']);
            expect(world.particles).toEqual(['minecraft:entity_effect']);
            expect(world.gameEvents).toEqual([
                {
                    event: 'minecraft:entity_interact',
                    at: { x: 0, y: FLOOR_Y + 1, z: 0 },
                    sourceId: entity.id
                }
            ]);
            expect(reports).toEqual([]);
        });

        it('drops the equipment slot an entity event names', () => {
            const world = new TestEntityWorld();
            const { runtime, reports } = entityFixture(
                world,
                {},
                {
                    'jsprismarine:dropper': {
                        components: { 'minecraft:health': { value: 20, max: 20 } },
                        events: {
                            'jsprismarine:drop_hand': {
                                drop_item: { slot: 'slot.weapon.mainhand' }
                            }
                        }
                    }
                }
            );
            const entity = runtime.spawn('jsprismarine:dropper', GROUND);
            if (entity === undefined) throw new Error('the fixture declares no entity with a drop event');
            entity.body.setEquipment({ mainhand: { identifier: 'minecraft:stick', count: 1 } });

            entity.instance.fire('jsprismarine:drop_hand');
            runtime.tick(1);

            expect(world.drops).toEqual([{ position: GROUND, item: { identifier: 'minecraft:stick', count: 1 } }]);
            expect(entity.body.equipment.mainhand).toBeUndefined();
            expect(reports).toEqual([]);
        });

        it('executes a data-defined event on the entity’s home block', () => {
            const world = new TestEntityWorld();
            const { runtime } = entityFixture(
                world,
                {},
                {
                    'jsprismarine:home_block_sender': {
                        components: { 'minecraft:health': { value: 20, max: 20 } },
                        events: {
                            'jsprismarine:touch_home': {
                                set_home_position: {},
                                execute_event_on_home_block: { event: 'jsprismarine:on_touch' }
                            }
                        }
                    }
                }
            );
            const entity = runtime.spawn('jsprismarine:home_block_sender', GROUND);
            if (entity === undefined) throw new Error('the fixture declares no entity with a home-block event');

            entity.instance.fire('jsprismarine:touch_home');
            runtime.tick(1);

            expect(world.entityEvents).toEqual([
                {
                    at: GROUND,
                    source: { id: entity.id, identifier: 'jsprismarine:home_block_sender', position: GROUND },
                    name: 'jsprismarine:on_touch'
                }
            ]);
        });
    });

    describe('entity facts', () => {
        it('reads a type’s stats off its definition rather than off a table', () => {
            const { runtime } = runtimeOf();
            const cow = runtime.typeFacts().get('minecraft:cow');

            expect(cow).toMatchObject({
                identifier: 'minecraft:cow',
                box: { width: 0.9, height: 1.3 },
                health: 10,
                attackDamage: 2,
                knockbackResistance: 0.25,
                followRange: 24,
                families: ['cow', 'mob'],
                lootTable: 'loot_tables/entities/cow.json'
            });
        });

        it('has no facts at all for a type no pack declared', () => {
            const { runtime } = runtimeOf();

            expect(runtime.typeFacts().get('minecraft:wither')).toBeUndefined();
        });
    });

    describe('position-dependent filter facts', () => {
        it('feeds world light into brightness filters used by environment sensors', () => {
            const { runtime } = entityFixture(
                new TestEntityWorld({ lightLevel: 15 }),
                {},
                {
                    'jsprismarine:brightness_probe': {
                        components: {
                            'minecraft:environment_sensor': {
                                triggers: {
                                    event: 'jsprismarine:bright',
                                    filters: {
                                        all_of: [
                                            { test: 'light_level', operator: '==', value: 15 },
                                            { test: 'is_brightness', operator: '>', value: 0.49 }
                                        ]
                                    }
                                }
                            }
                        },
                        component_groups: { bright: { 'minecraft:persistent': {} } },
                        events: { 'jsprismarine:bright': { add: { component_groups: ['bright'] } } }
                    }
                }
            );
            const probe = runtime.spawn('jsprismarine:brightness_probe', GROUND);
            if (probe === undefined) throw new Error('the fixture declares no brightness probe');

            const view = probe.instance.filterContext().self;
            expect(view.measure?.('light_level')).toBe(15);
            expect(view.measure?.('is_brightness')).toBe(1);

            runtime.tick(1);
            runtime.tick(2);

            expect(probe.instance.hasComponent('minecraft:persistent')).toBe(true);
        });
    });

    describe('spawning', () => {
        it('runs the spawn event for the cause, and only that one', () => {
            const { runtime } = runtimeOf();

            const spawned = runtime.spawn('jsprismarine:hatchling', GROUND);
            const born = runtime.spawn('jsprismarine:hatchling', GROUND, { cause: 'born' });

            expect(spawned?.instance.activeComponentGroups()).toEqual(['hatched']);
            expect(born?.instance.activeComponentGroups()).toEqual(['grown']);
        });

        it('replaces the built-in spawn event with the one the caller names', () => {
            const { runtime } = runtimeOf();

            const named = runtime.spawn('jsprismarine:hatchling', GROUND, { event: 'jsprismarine:named_spawn' });

            expect(named?.instance.activeComponentGroups()).toEqual(['grown', 'hatched']);
        });

        it('applies what the spawn event did to the entity’s own state', () => {
            const { runtime } = runtimeOf();

            const born = runtime.spawn('jsprismarine:hatchling', GROUND, { cause: 'born' });

            // The `grown` group replaces the base `minecraft:health`, which is the whole point
            // of a component group being a state machine rather than a patch.
            expect(born?.instance.attributes.get('health')?.max).toBe(12);
        });

        it('refuses a type the content declares nothing for, and says so', () => {
            const { runtime, reports } = runtimeOf();

            expect(runtime.spawn('minecraft:wither', GROUND)).toBeUndefined();
            expect(reports.join('\n')).toContain('minecraft:wither');
        });

        it('gives every entity a runtime id of its own', () => {
            const { runtime } = runtimeOf();

            const first = runtime.spawn('minecraft:cow', GROUND);
            const second = runtime.spawn('minecraft:cow', GROUND);

            expect(first?.id).not.toBe(second?.id);
            expect(runtime.all()).toHaveLength(2);
        });

        it('announces each entity once its spawn event has run', () => {
            const { runtime, spawned } = runtimeOf();

            runtime.spawn('jsprismarine:hatchling', GROUND);

            expect(spawned).toHaveLength(1);
            expect(spawned[0]?.instance.activeComponentGroups()).toEqual(['hatched']);
        });

        it('announces each removal with the reason it was given', () => {
            const { runtime, removed } = runtimeOf();

            const cow = runtime.spawn('minecraft:cow', GROUND);
            runtime.remove(cow!.id, 'despawn');

            expect(removed).toEqual([{ entity: cow, reason: 'despawn' }]);
        });
    });

    describe('item interactions', () => {
        it('feeds babies through ageable data and advances their growth timer', () => {
            const { runtime } = entityFixture(
                new TestEntityWorld(),
                {},
                {
                    'jsprismarine:ageable': {
                        components: { 'minecraft:health': { value: 10, max: 10 } },
                        component_groups: {
                            baby: {
                                'minecraft:is_baby': {},
                                'minecraft:ageable': {
                                    duration: 20,
                                    feed_items: [{ item: 'wheat', growth: 0.5, result_item: 'stick' }],
                                    grow_up: { event: 'jsprismarine:grow_up', target: 'self' },
                                    interact_filters: {
                                        all_of: [
                                            { test: 'is_baby' },
                                            { test: 'is_family', subject: 'other', value: 'player' }
                                        ]
                                    }
                                }
                            },
                            adult: { 'minecraft:health': { value: 10, max: 10 } }
                        },
                        events: {
                            'minecraft:entity_born': { add: { component_groups: ['baby'] } },
                            'jsprismarine:grow_up': {
                                add: { component_groups: ['adult'] },
                                remove: { component_groups: ['baby'] }
                            }
                        }
                    },
                    'jsprismarine:player_fixture': {
                        components: { 'minecraft:type_family': { family: ['player'] } }
                    }
                }
            );
            const baby = runtime.spawn('jsprismarine:ageable', GROUND, { cause: 'born' });
            const player = runtime.spawn('jsprismarine:player_fixture', { x: 2, y: 1, z: 2 });
            if (baby === undefined) throw new Error('the fixture declares no ageable entity');
            if (player === undefined) throw new Error('the fixture declares no player');

            expect(runtime.interactWithItem(baby.id, 42, 'minecraft:wheat')).toEqual({ accepted: false });

            expect(runtime.interactWithItem(baby.id, player.id, 'minecraft:wheat')).toEqual({
                accepted: true,
                resultItem: 'minecraft:stick'
            });
            expect(runtime.interactWithItem(baby.id, player.id, 'minecraft:wheat')).toEqual({
                accepted: true,
                resultItem: 'minecraft:stick'
            });

            for (let tick = 1; tick <= 99; tick += 1) runtime.tick(tick);
            expect(baby.instance.hasComponent('minecraft:is_baby')).toBe(true);

            runtime.tick(100);
            expect(baby.instance.hasComponent('minecraft:is_baby')).toBe(true);
            runtime.tick(101);
            expect(baby.instance.hasComponent('minecraft:is_baby')).toBe(false);
        });

        it('pauses and resets baby growth through ageable data', () => {
            const { runtime } = entityFixture(
                new TestEntityWorld(),
                {},
                {
                    'jsprismarine:ageable_controls': {
                        components: {},
                        component_groups: {
                            baby: {
                                'minecraft:is_baby': {},
                                'minecraft:ageable': {
                                    duration: 4,
                                    pause_growth_items: ['golden_dandelion'],
                                    reset_growth_items: ['golden_dandelion', 'clock'],
                                    pause_growth: 'jsprismarine:growth_paused',
                                    reset_growth: { event: 'jsprismarine:growth_reset', target: 'self' },
                                    grow_up: { event: 'jsprismarine:grown', target: 'self' }
                                }
                            },
                            pause_seen: { 'minecraft:persistent': {} },
                            reset_seen: { 'minecraft:fire_immune': {} },
                            adult: {}
                        },
                        events: {
                            'minecraft:entity_born': { add: { component_groups: ['baby'] } },
                            'jsprismarine:growth_paused': { add: { component_groups: ['pause_seen'] } },
                            'jsprismarine:growth_reset': { add: { component_groups: ['reset_seen'] } },
                            'jsprismarine:grown': {
                                add: { component_groups: ['adult'] },
                                remove: { component_groups: ['baby'] }
                            }
                        }
                    }
                }
            );
            const pausedBaby = runtime.spawn('jsprismarine:ageable_controls', GROUND, { cause: 'born' });
            const resetBaby = runtime.spawn('jsprismarine:ageable_controls', GROUND, { cause: 'born' });
            if (pausedBaby === undefined || resetBaby === undefined)
                throw new Error('the fixture declares no ageable baby');

            for (let tick = 1; tick <= 30; tick += 1) runtime.tick(tick);

            expect(runtime.interactWithItem(pausedBaby.id, 42, 'minecraft:golden_dandelion')).toEqual({
                accepted: true
            });
            expect(runtime.interactWithItem(resetBaby.id, 42, 'minecraft:clock')).toEqual({ accepted: true });
            runtime.tick(31);
            expect(pausedBaby.instance.activeComponentGroups()).toContain('pause_seen');
            expect(pausedBaby.instance.activeComponentGroups()).toContain('reset_seen');
            expect(resetBaby.instance.activeComponentGroups()).toContain('reset_seen');

            for (let tick = 32; tick <= 110; tick += 1) runtime.tick(tick);
            expect(resetBaby.instance.hasComponent('minecraft:is_baby')).toBe(true);

            runtime.tick(111);
            expect(resetBaby.instance.hasComponent('minecraft:is_baby')).toBe(false);

            for (let tick = 112; tick <= 131; tick += 1) runtime.tick(tick);
            expect(pausedBaby.instance.hasComponent('minecraft:is_baby')).toBe(true);
        });

        it('drops ageable items when the baby finishes growing', () => {
            const world = new TestEntityWorld();
            const { runtime } = entityFixture(
                world,
                {
                    itemDefinitions: vanillaItemDefinitions().filter(
                        (definition) => definition.identifier === 'minecraft:turtle_scute'
                    )
                },
                {
                    'jsprismarine:ageable_drops': {
                        components: {},
                        component_groups: {
                            baby: {
                                'minecraft:is_baby': {},
                                'minecraft:ageable': {
                                    duration: 0.1,
                                    drop_items: ['turtle_shell_piece'],
                                    grow_up: { event: 'jsprismarine:grown', target: 'self' }
                                }
                            },
                            adult: {}
                        },
                        events: {
                            'minecraft:entity_born': { add: { component_groups: ['baby'] } },
                            'jsprismarine:grown': {
                                add: { component_groups: ['adult'] },
                                remove: { component_groups: ['baby'] }
                            }
                        }
                    }
                }
            );
            const baby = runtime.spawn('jsprismarine:ageable_drops', GROUND, { cause: 'born' });
            if (baby === undefined) throw new Error('the fixture declares no ageable baby');

            runtime.tick(1);
            runtime.tick(2);

            expect(world.drops.map((drop) => drop.item.identifier)).toEqual(['minecraft:turtle_scute']);
            expect(baby.instance.hasComponent('minecraft:is_baby')).toBe(true);

            runtime.tick(3);
            expect(baby.instance.hasComponent('minecraft:is_baby')).toBe(false);
        });

        it('tames an entity from its data and applies its tame event', () => {
            const { runtime } = entityFixture(
                new TestEntityWorld(),
                {},
                {
                    'jsprismarine:tameable': {
                        components: {
                            'minecraft:health': { value: 20, max: 20 },
                            'minecraft:tameable': {
                                probability: 1,
                                tame_items: ['bone'],
                                tame_event: { event: 'jsprismarine:on_tame', target: 'self' }
                            }
                        },
                        component_groups: { tamed: { 'minecraft:is_tamed': {} } },
                        events: { 'jsprismarine:on_tame': { add: { component_groups: ['tamed'] } } }
                    }
                }
            );
            const wolf = runtime.spawn('jsprismarine:tameable', GROUND);
            if (wolf === undefined) throw new Error('the fixture declares no tameable entity');

            expect(runtime.interactWithItem(wolf.id, 42, 'minecraft:bone')).toEqual({ accepted: true });
            expect(wolf.body.owner).toBe(42);
            expect(wolf.instance.hasComponent('minecraft:is_tamed')).toBe(false);

            runtime.tick(1);

            expect(wolf.instance.hasComponent('minecraft:is_tamed')).toBe(true);
        });

        it('puts an eligible entity in love when fed an item from its data', () => {
            const { runtime } = entityFixture(
                new TestEntityWorld(),
                {},
                {
                    'jsprismarine:breedable': {
                        components: {
                            'minecraft:health': { value: 20, max: 20 },
                            'minecraft:breedable': {
                                require_tame: false,
                                breed_items: [{ item: 'wheat', result_item: 'stick' }]
                            }
                        }
                    }
                }
            );
            const cow = runtime.spawn('jsprismarine:breedable', GROUND);
            if (cow === undefined) throw new Error('the fixture declares no breedable entity');

            expect(runtime.interactWithItem(cow.id, 42, 'minecraft:wheat')).toEqual({
                accepted: true,
                resultItem: 'minecraft:stick'
            });
            expect(cow.body.loveTicks).toBe(600);
            expect(runtime.interactWithItem(cow.id, 42, 'minecraft:stick')).toEqual({ accepted: false });
        });

        it('heals an entity by the amount its healable data declares', () => {
            const { runtime } = entityFixture(
                new TestEntityWorld(),
                {},
                {
                    'jsprismarine:healable': {
                        components: {
                            'minecraft:health': { value: 20, max: 20 },
                            'minecraft:healable': {
                                items: [{ item: 'cooked_beef', heal_amount: 4, result_item: 'stick' }]
                            }
                        }
                    }
                }
            );
            const animal = runtime.spawn('jsprismarine:healable', GROUND);
            if (animal === undefined) throw new Error('the fixture declares no healable entity');
            animal.instance.damage({ cause: 'entity_attack', amount: 8 });

            expect(runtime.interactWithItem(animal.id, 42, 'minecraft:stick')).toEqual({ accepted: false });
            expect(runtime.interactWithItem(animal.id, 42, 'minecraft:cooked_beef')).toEqual({
                accepted: true,
                resultItem: 'minecraft:stick'
            });
            expect(animal.instance.attributes.get('health')?.current).toBe(16);
            expect(runtime.interactWithItem(animal.id, 42, 'minecraft:cooked_beef')).toEqual({
                accepted: true,
                resultItem: 'minecraft:stick'
            });
            expect(animal.instance.attributes.get('health')?.current).toBe(20);
            expect(runtime.interactWithItem(animal.id, 42, 'minecraft:cooked_beef')).toEqual({ accepted: false });
        });

        it('checks healable filters and lets force_use accept an item at full health', () => {
            const { runtime } = entityFixture(
                new TestEntityWorld(),
                {},
                {
                    'jsprismarine:force_use': {
                        components: {
                            'minecraft:health': { value: 20, max: 20 },
                            'minecraft:healable': {
                                force_use: true,
                                items: [{ item: 'cookie', heal_amount: 0 }]
                            }
                        }
                    },
                    'jsprismarine:filtered_healing': {
                        components: {
                            'minecraft:health': { value: 20, max: 20 },
                            'minecraft:healable': {
                                filters: { test: 'is_baby', value: true },
                                items: [{ item: 'cooked_beef', heal_amount: 4 }]
                            }
                        }
                    }
                }
            );
            const forceUse = runtime.spawn('jsprismarine:force_use', GROUND);
            const filtered = runtime.spawn('jsprismarine:filtered_healing', GROUND);
            if (forceUse === undefined || filtered === undefined)
                throw new Error('the fixture declares no healable entities');
            runtime.hurt(filtered, undefined, 'entity_attack', 8);

            expect(runtime.interactWithItem(forceUse.id, 42, 'minecraft:cookie')).toEqual({ accepted: true });
            expect(runtime.interactWithItem(filtered.id, 42, 'minecraft:cooked_beef')).toEqual({ accepted: false });
            expect(filtered.instance.attributes.get('health')?.current).toBe(12);
        });

        it('declines healable item effects the entity runtime does not apply', () => {
            const { runtime } = entityFixture(
                new TestEntityWorld(),
                {},
                {
                    'jsprismarine:effect_healing': {
                        components: {
                            'minecraft:health': { value: 20, max: 20 },
                            'minecraft:healable': {
                                force_use: true,
                                items: [{ item: 'cookie', heal_amount: 0, effects: [{ name: 'fatal_poison' }] }]
                            }
                        }
                    }
                }
            );
            const effectful = runtime.spawn('jsprismarine:effect_healing', GROUND);
            if (effectful === undefined) throw new Error('the fixture declares no entity with a healable effect');
            expect(runtime.interactWithItem(effectful.id, 42, 'minecraft:cookie')).toEqual({ accepted: false });
        });

        it('returns the configured result item after a successful tame', () => {
            const { runtime } = entityFixture(
                new TestEntityWorld(),
                {},
                {
                    'jsprismarine:bucket_tamer': {
                        components: {
                            'minecraft:health': { value: 20, max: 20 },
                            'minecraft:tameable': {
                                probability: 1,
                                tame_items: [{ item: 'milk_bucket', result_item: 'bucket' }]
                            }
                        }
                    }
                }
            );
            const animal = runtime.spawn('jsprismarine:bucket_tamer', GROUND);
            if (animal === undefined) throw new Error('the fixture declares no tameable entity');

            expect(runtime.interactWithItem(animal.id, 42, 'minecraft:milk_bucket')).toEqual({
                accepted: true,
                resultItem: 'minecraft:bucket'
            });
            expect(animal.body.owner).toBe(42);
        });

        it('matches data-defined entity interactions, fires their event, and transforms the held item', () => {
            const world = new TestEntityWorld();
            const { runtime } = entityFixture(
                world,
                {},
                {
                    'jsprismarine:interactable': {
                        components: {
                            'minecraft:health': { value: 20, max: 20 },
                            'minecraft:interact': {
                                interactions: [
                                    {
                                        on_interact: {
                                            filters: {
                                                all_of: [
                                                    { test: 'is_family', subject: 'other', value: 'player' },
                                                    {
                                                        test: 'has_equipment',
                                                        subject: 'other',
                                                        domain: 'hand',
                                                        value: 'bucket:0'
                                                    }
                                                ]
                                            },
                                            event: 'jsprismarine:interacted',
                                            target: 'self'
                                        },
                                        use_item: true,
                                        transform_to_item: 'bucket:1',
                                        play_sounds: 'milk'
                                    },
                                    {
                                        on_interact: {
                                            filters: {
                                                test: 'has_equipment',
                                                subject: 'other',
                                                domain: 'hand',
                                                value: 'stick:0'
                                            }
                                        },
                                        play_sounds: ['armor.equip_generic', 'saddle']
                                    }
                                ]
                            }
                        },
                        component_groups: { interacted: { 'minecraft:persistent': {} } },
                        events: { 'jsprismarine:interacted': { add: { component_groups: ['interacted'] } } }
                    }
                }
            );
            const animal = runtime.spawn('jsprismarine:interactable', GROUND);
            if (animal === undefined) throw new Error('the fixture declares no interactable entity');
            const playerView = (itemIdentifier: string): FilterEntityView => ({
                names: (name) => (name === 'is_family' ? ['player'] : undefined),
                equipment: (slot) => (slot === 'hand' ? { identifier: () => itemIdentifier, data: () => 0 } : undefined)
            });

            expect(runtime.interactWithItem(animal.id, 42, 'minecraft:bucket', playerView('minecraft:bucket'))).toEqual(
                {
                    accepted: true,
                    resultItem: 'minecraft:bucket',
                    resultItemData: 1,
                    consumeItem: true
                }
            );
            expect(runtime.interactWithItem(animal.id, 42, 'minecraft:stick', playerView('minecraft:stick'))).toEqual({
                accepted: true,
                consumeItem: false
            });
            expect(runtime.interactWithItem(animal.id, 42, 'minecraft:apple', playerView('minecraft:apple'))).toEqual({
                accepted: false
            });
            expect(world.sounds).toEqual(['milk', 'armor.equip_generic', 'saddle']);

            runtime.tick(1);

            expect(animal.instance.hasComponent('minecraft:persistent')).toBe(true);
        });

        it('emits the vibration declared by a successful data-defined interaction', () => {
            const world = new TestEntityWorld();
            const { runtime, reports } = entityFixture(
                world,
                {},
                {
                    'jsprismarine:vibration_interaction': {
                        components: {
                            'minecraft:health': { value: 20, max: 20 },
                            'minecraft:interact': {
                                interactions: { vibration: 'shear' }
                            }
                        }
                    }
                }
            );
            const entity = runtime.spawn('jsprismarine:vibration_interaction', GROUND);
            if (entity === undefined) throw new Error('the fixture declares no entity with an interaction vibration');

            expect(runtime.interactWithItem(entity.id, 42, 'minecraft:shears')).toEqual({
                accepted: true,
                consumeItem: false
            });
            expect(world.gameEvents).toEqual([
                {
                    event: 'minecraft:shear',
                    at: GROUND,
                    sourceId: entity.id
                }
            ]);
            expect(reports).toEqual([]);
        });

        it('enforces each data-defined interaction cooldown per entity', () => {
            const { runtime } = entityFixture(
                new TestEntityWorld(),
                {},
                {
                    'jsprismarine:cooldown_interaction': {
                        components: {
                            'minecraft:health': { value: 20, max: 20 },
                            'minecraft:interact': {
                                interactions: { use_item: true, cooldown: 0.1 }
                            }
                        }
                    },
                    'jsprismarine:attacked_interaction': {
                        components: {
                            'minecraft:health': { value: 20, max: 20 },
                            'minecraft:damage_sensor': {
                                triggers: [{ cause: 'entity_attack', deals_damage: 'yes' }]
                            },
                            'minecraft:interact': {
                                interactions: { use_item: true, cooldown_after_being_attacked: 0.1 }
                            }
                        }
                    }
                }
            );
            const cooling = runtime.spawn('jsprismarine:cooldown_interaction', GROUND);
            const independent = runtime.spawn('jsprismarine:cooldown_interaction', GROUND);
            const attacked = runtime.spawn('jsprismarine:attacked_interaction', GROUND);
            if (cooling === undefined || independent === undefined || attacked === undefined)
                throw new Error('the fixture declares no interaction cooldown entities');

            expect(runtime.interactWithItem(cooling.id, 42, 'minecraft:stick')).toEqual({
                accepted: true,
                consumeItem: true
            });
            expect(runtime.interactWithItem(independent.id, 42, 'minecraft:stick')).toEqual({
                accepted: true,
                consumeItem: true
            });
            expect(runtime.interactWithItem(cooling.id, 42, 'minecraft:stick')).toEqual({ accepted: false });
            runtime.tick(1);
            expect(runtime.interactWithItem(cooling.id, 42, 'minecraft:stick')).toEqual({ accepted: false });
            runtime.tick(2);
            expect(runtime.interactWithItem(cooling.id, 42, 'minecraft:stick')).toEqual({
                accepted: true,
                consumeItem: true
            });

            attacked.instance.damage({ cause: 'entity_attack', amount: 1 });
            expect(runtime.interactWithItem(attacked.id, 42, 'minecraft:stick')).toEqual({ accepted: false });
            runtime.tick(3);
            expect(runtime.interactWithItem(attacked.id, 42, 'minecraft:stick')).toEqual({ accepted: false });
            runtime.tick(4);
            expect(runtime.interactWithItem(attacked.id, 42, 'minecraft:stick')).toEqual({
                accepted: true,
                consumeItem: true
            });
        });
    });

    describe('physics', () => {
        it('floats a vanilla-shaped buoyant entity at the water surface', () => {
            const { runtime, world } = entityFixture(
                new TestEntityWorld(),
                {},
                {
                    'jsprismarine:buoyant': {
                        components: {
                            'minecraft:collision_box': { width: 1.4, height: 0.455 },
                            'minecraft:physics': {},
                            'minecraft:buoyant': { liquid_blocks: ['minecraft:water', 'minecraft:flowing_water'] }
                        }
                    }
                }
            );
            for (let x = -1; x <= 1; x += 1) {
                for (let z = -1; z <= 1; z += 1) world.setBlock({ x, y: FLOOR_Y + 1, z }, 'minecraft:water');
            }
            const boat = runtime.spawn('jsprismarine:buoyant', { x: 0.5, y: FLOOR_Y + 1.7, z: 0.5 });
            if (boat === undefined) throw new Error('the fixture declares no buoyant entity');

            for (let tick = 1; tick <= 200; tick += 1) runtime.tick(tick);

            expect(boat.body.conditions.has('in_water')).toBe(true);
            expect(boat.position.y).toBeGreaterThan(FLOOR_Y + 1.6);
            expect(boat.position.y).toBeLessThan(FLOOR_Y + 1.8);
        });

        it('keeps a walking entity from following a path vertically into the air', () => {
            const { runtime } = moverRuntime();
            const mover = runtime.spawn('jsprismarine:mover', GROUND);
            if (mover === undefined) throw new Error('the fixture declares no mover');
            mover.body.moveTo({ x: 0.5, y: GROUND.y + 4, z: 0.5 }, 1);

            runtime.tick(1);

            expect(mover.position.y).toBe(GROUND.y);
        });

        it('stops a walking entity at the collision box of a solid wall', () => {
            const world = new TestEntityWorld();
            world.setBlock({ x: 1, y: FLOOR_Y + 1, z: 0 }, 'minecraft:stone');
            world.setBlock({ x: 2, y: FLOOR_Y + 1, z: 0 }, 'minecraft:stone');
            world.setBlock({ x: 1, y: FLOOR_Y + 2, z: 0 }, 'minecraft:stone');
            const { runtime } = moverRuntime(world);
            const mover = runtime.spawn('jsprismarine:mover', GROUND);
            if (mover === undefined) throw new Error('the fixture declares no mover');
            mover.body.moveTo({ x: 3.5, y: GROUND.y, z: 0.5 }, 1);

            for (let tick = 1; tick <= 10; tick += 1) runtime.tick(tick);

            expect(mover.position.x).toBeLessThan(1);
        });

        it('pushes apart two data-driven entities that overlap at the exact same position', () => {
            const { runtime } = runtimeOf();
            const first = runtime.spawn('minecraft:cow', GROUND);
            const second = runtime.spawn('minecraft:cow', GROUND);
            if (first === undefined || second === undefined) throw new Error('the fixture declares no cow');

            runtime.tick(1);

            expect(Math.hypot(first.body.velocity.x, first.body.velocity.z)).toBeGreaterThan(0);
            expect(Math.hypot(second.body.velocity.x, second.body.velocity.z)).toBeGreaterThan(0);
            expect(first.body.velocity.x + second.body.velocity.x).toBeCloseTo(0);
            expect(first.body.velocity.z + second.body.velocity.z).toBeCloseTo(0);

            runtime.tick(2);

            expect(first.position).not.toEqual(second.position);
        });

        it('jumps onto a one-block step instead of moving upward through it', () => {
            const world = new TestEntityWorld();
            world.setBlock({ x: 1, y: FLOOR_Y + 1, z: 0 }, 'minecraft:stone');
            world.setBlock({ x: 2, y: FLOOR_Y + 1, z: 0 }, 'minecraft:stone');
            const { runtime } = moverRuntime(world);
            const mover = runtime.spawn('jsprismarine:mover', GROUND);
            if (mover === undefined) throw new Error('the fixture declares no mover');
            mover.body.moveTo({ x: 2.5, y: GROUND.y + 1, z: 0.5 }, 1);

            for (let tick = 1; tick <= 40; tick += 1) runtime.tick(tick);

            expect(mover.position.x).toBeGreaterThan(1.5);
            expect(mover.position.y).toBe(GROUND.y + 1);
        });

        it('uses the active jump component when the entity actuator jumps', () => {
            const { runtime } = moverRuntime();
            const mover = runtime.spawn('jsprismarine:mover', GROUND);
            if (mover === undefined) throw new Error('the fixture declares no mover');
            runtime.tick(1);

            mover.instance.actuator?.jump();

            expect(mover.body.velocity.y).toBe(0.8);
        });

        it('lets a zombie and villager fall onto solid ground and run their AI', () => {
            const { runtime } = entityFixture(
                new TestEntityWorld({ dayTime: 2000, random: [0.61, 0.5, 0.5] }),
                {},
                {
                    'minecraft:zombie': {
                        components: {
                            'minecraft:health': { value: 20, max: 20 },
                            'minecraft:movement': { value: 2 },
                            'minecraft:collision_box': { width: 0.6, height: 1.8 },
                            'minecraft:physics': {},
                            'minecraft:navigation.walk': {},
                            'minecraft:type_family': { family: ['zombie', 'monster', 'mob'] },
                            'minecraft:behavior.random_stroll': {
                                priority: 6,
                                interval: 1,
                                speed_multiplier: 1,
                                xz_dist: 5,
                                y_dist: 1
                            }
                        }
                    },
                    'minecraft:villager_v2': {
                        components: {
                            'minecraft:health': { value: 20, max: 20 },
                            'minecraft:movement': { value: 2 },
                            'minecraft:collision_box': { width: 0.6, height: 1.9 },
                            'minecraft:physics': {},
                            'minecraft:navigation.walk': {}
                        }
                    }
                }
            );
            const zombieStart = { ...GROUND, y: GROUND.y + 0.5 };
            const villagerStart = { ...zombieStart, x: 5.5 };
            const previouslySpawnedZombie = runtime.spawn('minecraft:zombie', zombieStart);
            if (previouslySpawnedZombie === undefined) throw new Error('the fixture declares no minecraft:zombie');
            const savedZombie = dataEntityRecordOf(previouslySpawnedZombie, undefined);
            runtime.remove(previouslySpawnedZombie.id, 'test restore');
            const zombie = runtime.restore(savedZombie, zombieStart);
            if (zombie === undefined) throw new Error('the fixture could not restore minecraft:zombie');
            const villager = runtime.spawn('minecraft:villager_v2', villagerStart);

            for (let tick = 1; tick <= 200; tick += 1) runtime.tick(tick);

            expect(zombie?.position.y).toBe(GROUND.y);
            expect(villager?.position.y).toBe(GROUND.y);
            expect(zombie?.position).not.toMatchObject({ x: zombieStart.x, z: zombieStart.z });
            expect(villager?.position).not.toMatchObject({ x: villagerStart.x, z: villagerStart.z });
        });

        it('looks at a player’s eyes from goal-driven AI', () => {
            const player = {
                id: 99,
                identifier: 'minecraft:player',
                position: { x: 4.5, y: GROUND.y, z: 0.5 }
            };
            const { runtime } = entityFixture(
                new TestEntityWorld({ players: [player] }),
                {},
                {
                    'jsprismarine:watcher': {
                        components: {
                            'minecraft:health': { value: 20, max: 20 },
                            'minecraft:collision_box': { width: 0.6, height: 1.8 },
                            'minecraft:behavior.look_at_player': {
                                priority: 1,
                                look_distance: 8,
                                probability: 1
                            }
                        }
                    }
                }
            );
            const watcher = runtime.spawn('jsprismarine:watcher', GROUND);
            if (watcher === undefined) throw new Error('the fixture declares no watcher');

            runtime.tick(1);

            expect(watcher.body.pitch).toBeGreaterThan(-5);
            expect(watcher.body.pitch).toBeLessThan(5);
        });

        it('looks at a player’s eyes from brain-driven AI', () => {
            const player = {
                id: 99,
                identifier: 'minecraft:player',
                position: { x: 4.5, y: GROUND.y, z: 0.5 }
            };
            const { runtime } = entityFixture(new TestEntityWorld({ players: [player] }));
            const villager = runtime.spawn('minecraft:villager_v2', GROUND);
            if (villager?.brain === undefined) throw new Error('the fixture villager has no brain');
            const target = runtime.brainWorld().players()[0];
            if (target === undefined) throw new Error('the fixture has no player target');
            villager.brain.setMemory(MemoryModuleTypes.LOOK_TARGET, entityTracker(target));

            runtime.tick(1);

            expect(villager.body.pitch).toBeGreaterThan(-5);
            expect(villager.body.pitch).toBeLessThan(5);
        });

        it('aims a launched projectile along its velocity from its own eye position', () => {
            const { runtime } = entityFixture(
                new TestEntityWorld(),
                {},
                {
                    'jsprismarine:projectile': {
                        components: {
                            'minecraft:collision_box': { width: 0.25, height: 0.25 },
                            'minecraft:projectile': {}
                        }
                    }
                }
            );
            const projectile = runtime.launchProjectile(
                'jsprismarine:projectile',
                GROUND,
                { x: 0, y: 0, z: 1 },
                1,
                0,
                1
            );

            if (projectile === undefined) throw new Error('the fixture projectile did not launch');

            expect(projectile.body.yaw).toBeCloseTo(0);
            expect(projectile.body.pitch).toBeCloseTo(0);
        });

        it('respects entity data that disables gravity', () => {
            const { runtime } = entityFixture(
                new TestEntityWorld(),
                {},
                {
                    'jsprismarine:buoyant': {
                        components: {
                            'minecraft:health': { value: 20, max: 20 },
                            'minecraft:physics': { has_gravity: false }
                        }
                    }
                }
            );
            const spawnPosition = { ...GROUND, y: GROUND.y + 0.5 };
            const buoyant = runtime.spawn('jsprismarine:buoyant', spawnPosition);

            for (let tick = 1; tick <= 10; tick += 1) runtime.tick(tick);

            expect(buoyant?.position.y).toBe(spawnPosition.y);
        });
    });

    describe('target eligibility', () => {
        it('updates brain combat targetability immediately when a player changes game mode', () => {
            const player = {
                id: 99,
                identifier: 'minecraft:player',
                position: { x: 2.5, y: FLOOR_Y + 1, z: 0.5 },
                creative: false,
                spectator: false
            };
            const world = new TestEntityWorld({ players: [player] });
            const { runtime } = entityFixture(world);
            const cow = runtime.spawn('minecraft:cow', GROUND);
            if (cow === undefined) throw new Error('the fixture declares no minecraft:cow');
            const brainWorld = runtime.brainWorld();
            const brainBody = brainEntityOf(cow, runtime);
            const brainPlayer = brainWorld.players()[0];
            if (brainPlayer === undefined) throw new Error('the test world has no player');

            expect(brainWorld.isAttackable(brainBody, brainPlayer)).toBe(true);

            world.players = [{ ...player, creative: true }];

            expect(brainWorld.isTargetable(brainBody, brainPlayer)).toBe(true);
            expect(brainWorld.isAttackable(brainBody, brainPlayer)).toBe(false);
        });

        it('ignores creative players and drops a target when a player switches to creative', () => {
            const player = {
                id: 99,
                identifier: 'minecraft:player',
                position: { x: 8.5, y: FLOOR_Y + 1, z: 0.5 },
                creative: true,
                spectator: false
            };
            const world = new TestEntityWorld({ players: [player] });
            const { runtime } = entityFixture(
                world,
                {},
                {
                    'minecraft:zombie': {
                        components: {
                            'minecraft:health': { value: 20, max: 20 },
                            'minecraft:movement': { value: 1 },
                            'minecraft:follow_range': { value: 24 },
                            'minecraft:collision_box': { width: 0.6, height: 1.8 },
                            'minecraft:physics': {},
                            'minecraft:navigation.walk': {},
                            'minecraft:type_family': { family: ['zombie', 'monster', 'mob'] },
                            'minecraft:behavior.nearest_attackable_target': {
                                priority: 1,
                                within_radius: 24,
                                entity_types: [
                                    { filters: { test: 'is_family', subject: 'other', value: 'player' }, max_dist: 24 }
                                ]
                            }
                        }
                    }
                }
            );
            const zombie = runtime.spawn('minecraft:zombie', GROUND);

            for (let tick = 1; tick <= 20; tick += 1) runtime.tick(tick);
            expect(zombie?.target).toBeUndefined();

            world.players = [{ ...player, creative: false }];
            for (let tick = 21; tick <= 40; tick += 1) runtime.tick(tick);
            expect(zombie?.target).toBe(player.id);

            world.players = [player];
            runtime.tick(41);
            expect(zombie?.target).toBeUndefined();
        });

        it('blocks attacks on protected entities unless the attacker data allows them', () => {
            const { runtime } = entityFixture(
                new TestEntityWorld(),
                {},
                {
                    'jsprismarine:protected_target': {
                        components: {
                            'minecraft:health': { value: 20, max: 20 },
                            'minecraft:type_family': { family: ['ghast', 'monster'] },
                            'minecraft:cannot_be_attacked': {}
                        }
                    },
                    'jsprismarine:hunter': {
                        components: {
                            'minecraft:health': { value: 20, max: 20 },
                            'minecraft:movement': { value: 1 },
                            'minecraft:collision_box': { width: 0.6, height: 1.8 },
                            'minecraft:physics': {},
                            'minecraft:type_family': { family: ['hunter', 'monster'] },
                            'minecraft:behavior.nearest_attackable_target': {
                                priority: 1,
                                entity_types: [
                                    { filters: { test: 'is_family', subject: 'other', value: 'ghast' }, max_dist: 16 }
                                ]
                            }
                        }
                    },
                    'jsprismarine:permitted_hunter': {
                        components: {
                            'minecraft:health': { value: 20, max: 20 },
                            'minecraft:movement': { value: 1 },
                            'minecraft:collision_box': { width: 0.6, height: 1.8 },
                            'minecraft:physics': {},
                            'minecraft:type_family': { family: ['hunter', 'monster'] },
                            'minecraft:behavior.nearest_attackable_target': {
                                priority: 1,
                                entity_types: [
                                    { filters: { test: 'is_family', subject: 'other', value: 'ghast' }, max_dist: 16 }
                                ]
                            }
                        },
                        component_groups: {
                            allowed_target: {
                                'minecraft:ignore_cannot_be_attacked': {
                                    filters: { test: 'is_family', subject: 'other', value: 'ghast' }
                                }
                            },
                            any_target: {
                                'minecraft:ignore_cannot_be_attacked': {}
                            }
                        },
                        events: {
                            'jsprismarine:allow_target': { add: { component_groups: ['allowed_target'] } },
                            'jsprismarine:allow_any_target': {
                                remove: { component_groups: ['allowed_target'] },
                                add: { component_groups: ['any_target'] }
                            },
                            'jsprismarine:disallow_target': {
                                remove: { component_groups: ['allowed_target', 'any_target'] }
                            }
                        }
                    }
                }
            );
            const target = runtime.spawn('jsprismarine:protected_target', GROUND);
            const hunter = runtime.spawn('jsprismarine:hunter', { ...GROUND, x: 3 });
            const permittedHunter = runtime.spawn('jsprismarine:permitted_hunter', { ...GROUND, x: -3 });
            if (target === undefined || hunter === undefined || permittedHunter === undefined)
                throw new Error('the fixture does not declare the protected target and both hunters');

            for (let tick = 1; tick <= 20; tick += 1) runtime.tick(tick);

            expect(hunter.target).toBeUndefined();
            expect(permittedHunter.target).toBeUndefined();

            permittedHunter.instance.fire('jsprismarine:allow_target');
            for (let tick = 21; tick <= 40; tick += 1) runtime.tick(tick);
            expect(permittedHunter.target).toBe(target.id);

            const startingHealth = target.instance.attributes.get('health')?.current;
            if (startingHealth === undefined) throw new Error('the protected target has no health');
            runtime.hurt(target, hunter.id, 'entity_attack', 5);
            runtime.hurt(target, hunter.id, 'projectile', 5);
            runtime.hurt(target, hunter.id, 'entity_explosion', 5);
            expect(target.instance.attributes.get('health')?.current).toBe(startingHealth);

            runtime.hurt(target, permittedHunter.id, 'entity_attack', 5);
            expect(target.instance.attributes.get('health')?.current).toBe(startingHealth - 5);
            runtime.hurt(target, permittedHunter.id, 'projectile', 5);
            expect(target.instance.attributes.get('health')?.current).toBe(startingHealth - 10);

            permittedHunter.instance.fire('jsprismarine:allow_any_target');
            runtime.tick(41);
            runtime.hurt(target, permittedHunter.id, 'entity_attack', 5);
            expect(target.instance.attributes.get('health')?.current).toBe(startingHealth - 15);

            permittedHunter.instance.fire('jsprismarine:disallow_target');
            runtime.tick(42);
            runtime.hurt(target, permittedHunter.id, 'entity_attack', 5);
            expect(target.instance.attributes.get('health')?.current).toBe(startingHealth - 15);
        });
    });

    describe('combat', () => {
        it('sends a blow at a player out through the host', () => {
            const player = { id: 99, identifier: 'minecraft:player', position: { x: 1, y: FLOOR_Y + 1, z: 0 } };
            const world = new TestEntityWorld({ players: [player] });
            const { runtime } = runtimeOf(world);

            const cow = runtime.spawn('minecraft:cow', GROUND);
            runtime.attack(cow!.body, runtime.mobById(99)!);

            expect(world.hits).toEqual([{ id: 99, amount: 2, cause: 'entity_attack', sourceId: cow!.id }]);
        });

        it('takes health off an entity this index does hold', () => {
            const { runtime } = runtimeOf();

            const attacker = runtime.spawn('minecraft:cow', GROUND);
            const victim = runtime.spawn('minecraft:cow', GROUND);
            runtime.attack(attacker!.body, runtime.mobById(victim!.id)!);

            expect(victim!.instance.attributes.get('health')?.current).toBe(8);
            expect(victim!.body.damage.last()?.sourceId).toBe(attacker!.id);
        });

        it('removes a lethal hit immediately when no death event was queued', () => {
            const { runtime, world } = runtimeOf();
            const cow = runtime.spawn('minecraft:cow', GROUND);
            if (cow === undefined) throw new Error('the fixture declares no cow');

            runtime.hurt(cow, undefined, 'entity_attack', 10);

            expect(runtime.all()).not.toContain(cow);
            expect(world.drops.map((drop) => drop.item.identifier)).toEqual(['minecraft:leather']);
        });
    });

    describe('the goal scheduler', () => {
        it('gives a contested control flag to the better priority', () => {
            const world = new TestEntityWorld({
                players: [{ id: 99, identifier: 'minecraft:player', position: { x: 2, y: FLOOR_Y + 1, z: 0 } }]
            });
            const { runtime } = runtimeOf(world);

            const wanderer = runtime.spawn('jsprismarine:wanderer', GROUND);
            runtime.tick(1);

            // `look_at_player` is priority 2 and `random_stroll` is priority 6; both were
            // forced onto the move flag, and 0 is the highest priority.
            expect(wanderer?.instance.goals.names()).toEqual([
                'minecraft:behavior.look_at_player',
                'minecraft:behavior.random_stroll'
            ]);
            expect(wanderer?.instance.goals.holderOf('move')).toBe('minecraft:behavior.look_at_player');
        });

        it('walks the entity to where the running goal sent it', () => {
            // No players, so `look_at_player` cannot start and the stroll takes the move flag.
            const world = new TestEntityWorld({ random: [0.95, 0.5, 0.5, 0.1] });
            const { runtime } = runtimeOf(world);

            const wanderer = runtime.spawn('jsprismarine:wanderer', GROUND);
            const before = { ...(wanderer?.position ?? GROUND) };
            for (let tick = 1; tick <= 20; tick += 1) runtime.tick(tick);

            expect(wanderer?.instance.goals.holderOf('move')).toBe('minecraft:behavior.random_stroll');
            expect(wanderer?.position).not.toEqual(before);
        });

        it('runs no goals for an entity whose definition declares none', () => {
            const { runtime } = runtimeOf();

            const cow = runtime.spawn('minecraft:cow', GROUND);
            runtime.tick(1);

            expect(cow?.instance.goals.names()).toEqual([]);
        });
    });

    describe('brains', () => {
        it('runs a brain mob’s brain and reaches an activity', () => {
            const { runtime } = runtimeOf();

            const goat = runtime.spawn('minecraft:goat', GROUND);
            runtime.tick(1);

            expect(goat?.brainMob?.id).toBe('minecraft:goat');
            expect(goat?.brain?.isActive(Activities.IDLE)).toBe(true);
        });

        it('leaves a goal-only entity without a brain', () => {
            const { runtime } = runtimeOf();

            expect(runtime.spawn('minecraft:cow', GROUND)?.brain).toBeUndefined();
        });

        it('runs the goal scheduler for everything that is not a brain mob', () => {
            const { runtime } = runtimeOf();

            expect(runtime.spawn('minecraft:cow', GROUND)?.runsGoals).toBe(true);
            expect(runtime.spawn('minecraft:goat', GROUND)?.runsGoals).toBe(false);
        });

        it('routes a walking brain mob around solid blocks', () => {
            const world = new TestEntityWorld();
            world.setBlock({ x: 1, y: FLOOR_Y + 1, z: 0 }, 'minecraft:stone');
            world.setBlock({ x: 1, y: FLOOR_Y + 2, z: 0 }, 'minecraft:stone');
            const { runtime } = brainGoatRuntime('walk', world);
            const goat = runtime.spawn('minecraft:goat', GROUND);
            if (goat?.brain === undefined) throw new Error('the fixture declares no brain for minecraft:goat');

            const mob = brainMobOf(goat, goat.brain, runtime);
            const target = { x: 2.5, y: FLOOR_Y + 1, z: 0.5 };
            expect(mob.navigation.moveTo(target, 1)).toBe(true);
            for (let tick = 0; tick < 30; tick += 1) {
                expect(mob.navigation.moveTo(target, 1)).toBe(true);
                tickBrainNavigation(goat);
                goat.body.step();
                expect(Math.floor(goat.position.x) === 1 && Math.floor(goat.position.z) === 0).toBe(false);
            }
        });

        it('does not let a walking brain mob fly to a position without ground support', () => {
            const { runtime } = brainGoatRuntime('walk');
            const goat = runtime.spawn('minecraft:goat', GROUND);
            if (goat?.brain === undefined) throw new Error('the fixture declares no brain for minecraft:goat');

            const mob = brainMobOf(goat, goat.brain, runtime);
            const target = { x: 0.5, y: FLOOR_Y + 5, z: 0.5 };
            expect(mob.navigation.canReach(target)).toBe(false);
            expect(mob.navigation.moveTo(target, 1)).toBe(false);
            for (let tick = 0; tick < 30; tick += 1) goat.body.step();

            expect(goat.position.y).toBe(GROUND.y);
        });

        it('lets a brain mob fly when its navigation component allows it', () => {
            const { runtime } = brainGoatRuntime('fly');
            const goat = runtime.spawn('minecraft:goat', GROUND);
            if (goat?.brain === undefined) throw new Error('the fixture declares no brain for minecraft:goat');

            const mob = brainMobOf(goat, goat.brain, runtime);
            const target = { x: 0.5, y: FLOOR_Y + 5, z: 0.5 };
            expect(mob.navigation.moveTo(target, 1)).toBe(true);
            for (let tick = 0; tick < 10; tick += 1) {
                expect(mob.navigation.moveTo(target, 1)).toBe(true);
                tickBrainNavigation(goat);
                goat.body.step();
            }

            expect(goat.position.y).toBeGreaterThan(GROUND.y);
        });
    });

    describe('death', () => {
        it('drops what the entity’s own loot table rolls', () => {
            const world = new TestEntityWorld();
            const { runtime } = runtimeOf(world);

            const cow = runtime.spawn('minecraft:cow', GROUND);
            runtime.kill(cow!);

            expect(world.drops.map((drop) => drop.item.identifier)).toEqual(['minecraft:leather']);
            expect(runtime.all()).toHaveLength(0);
        });

        it('rolls nothing with doMobLoot off, and still takes the entity', () => {
            const world = new TestEntityWorld({ gameRules: { doMobLoot: false } });
            const { runtime } = runtimeOf(world);

            const cow = runtime.spawn('minecraft:cow', GROUND);
            runtime.kill(cow!);

            expect(world.drops).toHaveLength(0);
            expect(runtime.all()).toHaveLength(0);
        });
    });

    describe('counting', () => {
        it('counts entities of one type within a radius', () => {
            const { runtime } = runtimeOf();

            runtime.spawn('minecraft:cow', GROUND);
            runtime.spawn('minecraft:cow', { x: 20, y: FLOOR_Y + 1, z: 0 });

            expect(runtime.countOfType('minecraft:cow', GROUND, 5)).toBe(1);
            expect(runtime.countOfType('minecraft:cow', GROUND, 30)).toBe(2);
        });

        it('counts a population pool only while its entities are alive', () => {
            const { runtime } = runtimeOf();

            const cow = runtime.spawn('minecraft:cow', GROUND, { pool: 'animal' });
            expect(runtime.poolCount('animal')).toBe(1);

            runtime.remove(cow!.id, 'despawn');
            expect(runtime.poolCount('animal')).toBe(0);
        });
    });
});
