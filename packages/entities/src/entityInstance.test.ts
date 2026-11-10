import { describe, expect, it } from 'vitest';

import type { AttributeWrite } from './attributes';
import type { ComponentGroupsWrite, EntityEnvironment, EntityInstance } from './entityInstance';
import type { PropertyValueWrite } from './properties';
import { EntityTypes } from './entityTypes';
import type { EntityPosition } from './hooks';

/** A random source that hands out a fixed list and then repeats the last value. */
const scripted = (...values: readonly number[]) => {
    let index = 0;
    return { next: () => values[Math.min(index++, values.length - 1)] ?? 0 };
};

const zombie = {
    format_version: '1.26.50',
    'minecraft:entity': {
        description: {
            identifier: 'minecraft:zombie',
            is_spawnable: true,
            is_summonable: true,
            properties: {
                'minecraft:is_riding_zombie_horse': { client_sync: false, default: false, type: 'bool' },
                'minecraft:state': {
                    type: 'enum',
                    default: 'neutral',
                    values: ['neutral', 'hostile_observed'],
                    client_sync: true
                }
            }
        },
        components: {
            'minecraft:physics': {},
            'minecraft:health': { value: 20, max: 20 },
            'minecraft:movement': { value: 0.23 },
            'minecraft:collision_box': { width: 0.6, height: 1.9 },
            'minecraft:type_family': { family: ['zombie', 'undead', 'monster', 'mob'] },
            'minecraft:loot': { table: 'loot_tables/entities/zombie.json' }
        },
        component_groups: {
            'minecraft:zombie_adult': {
                'minecraft:experience_reward': { on_death: 'query.last_hit_by_player ? 5 : 0' },
                'minecraft:type_family': { family: ['zombie', 'undead', 'monster', 'mob'] }
            },
            'minecraft:zombie_baby': {
                'minecraft:is_baby': {},
                'minecraft:scale': { value: 0.5 },
                'minecraft:movement': { value: 0.35 },
                'minecraft:type_family': { family: ['zombie', 'undead', 'monster', 'mob', 'baby'] }
            },
            'minecraft:can_break_doors': { 'minecraft:annotation.break_door': {} },
            'minecraft:timed': {
                'minecraft:timer': { looping: false, time: 1, time_down_event: { event: 'minecraft:rang' } }
            }
        },
        events: {
            'minecraft:entity_spawned': {
                sequence: [
                    {
                        randomize: [
                            { weight: 9500, add: { component_groups: ['minecraft:zombie_adult'] } },
                            { weight: 500, add: { component_groups: ['minecraft:zombie_baby'] } }
                        ]
                    },
                    {
                        randomize: [
                            { weight: 10, add: { component_groups: ['minecraft:can_break_doors'] } },
                            { weight: 90 }
                        ]
                    }
                ]
            },
            'minecraft:as_baby': {
                add: { component_groups: ['minecraft:zombie_baby'] },
                remove: { component_groups: ['minecraft:zombie_adult'] }
            },
            'minecraft:as_adult': {
                add: { component_groups: ['minecraft:zombie_adult'] },
                remove: { component_groups: ['minecraft:zombie_baby'] }
            },
            'minecraft:start_timer': { add: { component_groups: ['minecraft:timed'] } },
            'minecraft:rang': { set_property: { 'minecraft:state': 'hostile_observed' } },
            'minecraft:mount': { set_property: { 'minecraft:is_riding_zombie_horse': true } }
        }
    }
};

const load = (...files: unknown[]) => {
    const types = new EntityTypes();
    const diagnostics = types.load(
        files.map((data, index) => ({ data, pack: 'vanilla', path: `entities/${index}.json` }))
    );
    return { types, diagnostics };
};

const spawn = (environment: EntityEnvironment = {}, event?: string): EntityInstance => {
    const { types } = load(zombie);
    return types.spawn('minecraft:zombie', { environment, event });
};

describe('EntityTypes', () => {
    it('loads a definition with no diagnostics when every component is implemented', () => {
        const { diagnostics } = load(zombie);

        expect(diagnostics).toEqual([]);
    });

    it('reports a component no factory implements and loads the type anyway', () => {
        const { types, diagnostics } = load({
            format_version: '1.26.50',
            'minecraft:entity': {
                description: { identifier: 'test:odd' },
                components: { 'minecraft:invented_component': {} }
            }
        });

        expect(diagnostics).toEqual([
            {
                severity: 'warning',
                code: 'component.unknown',
                pack: 'vanilla',
                path: 'entities/0.json',
                message: 'no component is registered as minecraft:invented_component'
            }
        ]);
        expect(types.registry.get('test:odd')?.unimplementedComponents).toEqual(['minecraft:invented_component']);
    });
});

describe('spawning', () => {
    it('runs exactly one spawn event and applies it at once', () => {
        const entity = spawn({ random: scripted(0, 0) });

        expect(entity.activeComponentGroups()).toEqual(['minecraft:zombie_adult', 'minecraft:can_break_doors']);
        expect(entity.hasComponent('minecraft:annotation.break_door')).toBe(true);
    });

    it('lets a named event replace the built-in spawn event', () => {
        const entity = spawn({ random: scripted(0, 0) }, 'minecraft:as_baby');

        expect(entity.activeComponentGroups()).toEqual(['minecraft:zombie_baby']);
    });

    it('reads the identifier<event> form', () => {
        const { types } = load(zombie);
        const entity = types.spawn('minecraft:zombie<minecraft:as_baby>');

        expect(entity.activeComponentGroups()).toEqual(['minecraft:zombie_baby']);
    });

    it('starts every attribute at the value its base component declares', () => {
        const entity = spawn({ random: scripted(0, 0) });

        expect(entity.attributes.value('health')).toBe(20);
        expect(entity.attributes.value('movement')).toBeCloseTo(0.23);
    });
});

describe('component groups', () => {
    it("lets a group's component replace a base component of the same name", () => {
        const entity = spawn({ random: scripted(0, 0) }, 'minecraft:as_baby');

        expect(entity.attributes.value('movement')).toBeCloseTo(0.35);
        expect(entity.hasComponent('minecraft:is_baby')).toBe(true);
    });

    it('puts a base component back when the group that replaced it is removed', () => {
        const entity = spawn({ random: scripted(0, 0) }, 'minecraft:as_baby');

        entity.fire('minecraft:as_adult');
        entity.tick();

        expect(entity.hasComponent('minecraft:is_baby')).toBe(false);
        expect(entity.attributes.value('movement')).toBeCloseTo(0.23);
    });

    it('re-initializes the components of a group that is added again', () => {
        const entity = spawn({ random: scripted(0, 0) }, 'minecraft:as_baby');
        entity.attributes.set('movement', 0.01);

        entity.fire('minecraft:as_baby');
        entity.tick();

        expect(entity.attributes.value('movement')).toBeCloseTo(0.35);
    });

    it('restarts a timer when its group is added again', () => {
        const fired: string[] = [];
        const { types } = load(zombie);
        const entity = types.spawn('minecraft:zombie', {
            environment: { random: scripted(0, 0), report: (message) => fired.push(message) }
        });

        entity.fire('minecraft:start_timer');
        entity.tick();
        for (let tick = 0; tick < 15; tick += 1) entity.tick();
        expect(entity.properties.get('minecraft:state')).toBe('neutral');

        // Re-adding the group starts the timing over, so the 20 ticks the
        // timer needs have to be counted again from here.
        entity.fire('minecraft:start_timer');
        entity.tick();
        for (let tick = 0; tick < 15; tick += 1) entity.tick();
        expect(entity.properties.get('minecraft:state')).toBe('neutral');

        for (let tick = 0; tick < 6; tick += 1) entity.tick();
        expect(entity.properties.get('minecraft:state')).toBe('hostile_observed');
    });

    it('reports an event that adds a group the entity does not declare', () => {
        const reported: string[] = [];
        const { types } = load({
            format_version: '1.26.50',
            'minecraft:entity': {
                description: { identifier: 'test:typo' },
                events: { 'minecraft:entity_spawned': { add: { component_groups: ['test:absent'] } } }
            }
        });
        types.spawn('test:typo', { environment: { report: (message) => reported.push(message) } });

        expect(reported[0]).toContain('test:absent');
    });
});

describe('the tick queue', () => {
    it('settles an event at once but applies it on the next tick', () => {
        const entity = spawn({ random: scripted(0, 0) });

        const effects = entity.fire('minecraft:as_baby');

        expect(effects.addGroups).toEqual(['minecraft:zombie_baby']);
        expect(entity.hasComponent('minecraft:is_baby')).toBe(false);

        entity.tick();

        expect(entity.hasComponent('minecraft:is_baby')).toBe(true);
    });

    it('applies the queued events in the order they were fired', () => {
        const entity = spawn({ random: scripted(0, 0) });

        entity.fire('minecraft:as_baby');
        entity.fire('minecraft:as_adult');
        entity.tick();

        expect(entity.activeComponentGroups()).toEqual(['minecraft:can_break_doors', 'minecraft:zombie_adult']);
    });
});

describe('properties', () => {
    it('writes a property an event sets and clamps it into its domain', () => {
        const entity = spawn({ random: scripted(0, 0) });

        entity.fire('minecraft:mount');
        entity.tick();

        expect(entity.properties.get('minecraft:is_riding_zombie_horse')).toBe(true);
    });

    it('reports a write the property rejects', () => {
        const reported: string[] = [];
        const { types } = load({
            format_version: '1.26.50',
            'minecraft:entity': {
                description: {
                    identifier: 'test:props',
                    properties: { 'test:state': { type: 'enum', default: 'a', values: ['a', 'b'] } }
                },
                events: { 'minecraft:set': { set_property: { 'test:state': 'c' } } }
            }
        });
        const entity = types.spawn('test:props', { environment: { report: (message) => reported.push(message) } });

        entity.fire('minecraft:set');
        entity.tick();

        expect(entity.properties.get('test:state')).toBe('a');
        expect(reported.join('\n')).toContain('test:state');
    });

    it('answers its own property and component filter tests without a caller view', () => {
        const entity = spawn({ random: scripted(0, 0) }, 'minecraft:as_baby');
        const self = entity.filterContext().self;

        expect(self.property?.('minecraft:state')).toBe('neutral');
        expect(self.hasProperty?.('minecraft:state')).toBe(true);
        expect(self.hasComponent?.('minecraft:is_baby')).toBe(true);
        expect(self.names?.('is_family')).toContain('baby');
        expect(self.flag?.('is_baby')).toBe(true);
        expect(self.measure?.('actor_health')).toBe(20);
    });
});

describe('goals', () => {
    const positions: EntityPosition = { x: 0, y: 64, z: 0 };

    const walker = {
        format_version: '1.26.50',
        'minecraft:entity': {
            description: { identifier: 'test:walker' },
            components: {
                'minecraft:behavior.random_stroll': { priority: 6, speed_multiplier: 1, interval: 1 },
                'minecraft:behavior.float': { priority: 0 }
            },
            component_groups: {
                'test:calm': {},
                'test:looking': { 'minecraft:behavior.look_at_player': { priority: 7, probability: 1 } }
            },
            events: { 'test:look': { add: { component_groups: ['test:looking'] } } }
        }
    };

    const actuator = () => {
        const log: string[] = [];
        return {
            log,
            actuator: {
                position: () => positions,
                moveTo: (_target: EntityPosition, speed: number) => log.push(`moveTo ${speed}`),
                stopMoving: () => log.push('stopMoving'),
                lookAt: () => log.push('lookAt'),
                jump: () => log.push('jump'),
                randomTarget: () => positions,
                nearestPlayer: () => positions
            }
        };
    };

    it('registers a goal component with the scheduler and runs it', () => {
        const { log, actuator: control } = actuator();
        const { types } = load(walker);
        const entity = types.spawn('test:walker', { environment: { actuator: control, random: scripted(0) } });

        expect(entity.goals.names()).toEqual(['minecraft:behavior.float', 'minecraft:behavior.random_stroll']);

        entity.tick();

        expect(entity.goals.holderOf('move')).toBe('minecraft:behavior.random_stroll');
        expect(log).toContain('moveTo 1');
    });

    it('selects goals on the first tick, then on the entity id phase', () => {
        const { types } = load(zombie);
        const entity = types.spawn('minecraft:zombie', { id: 1 });
        let checks = 0;
        entity.goals.add({
            name: 'test:selector-phase',
            priority: 0,
            controlFlags: [],
            goal: { canStart: () => (checks += 1) > 1 }
        });

        entity.tick();
        expect(checks).toBe(1);
        expect(entity.noActionTime).toBe(1);
        entity.tick();
        expect(checks).toBe(1);
        entity.tick();
        expect(checks).toBe(2);
        expect(entity.noActionTime).toBe(3);
    });

    it('takes a goal off the scheduler when its group is removed', () => {
        const { actuator: control } = actuator();
        const { types } = load(walker);
        const entity = types.spawn('test:walker', { environment: { actuator: control, random: scripted(0) } });

        entity.fire('test:look');
        entity.tick();
        expect(entity.goals.names()).toContain('minecraft:behavior.look_at_player');

        entity.applyEffects({
            event: 'test:unlook',
            addGroups: [],
            removeGroups: ['test:looking'],
            propertyWrites: [],
            outgoingTriggers: [],
            actions: [],
            unhandled: []
        });

        expect(entity.goals.names()).not.toContain('minecraft:behavior.look_at_player');
    });
});

describe('damage', () => {
    const creeper = {
        format_version: '1.26.50',
        'minecraft:entity': {
            description: { identifier: 'test:creeper' },
            components: {
                'minecraft:health': { value: 20, max: 20 },
                'minecraft:damage_sensor': {
                    triggers: [
                        { cause: 'fall', deals_damage: false },
                        { cause: 'lightning', deals_damage: false, on_damage: { event: 'test:charged' } }
                    ]
                }
            },
            component_groups: { 'test:charged_group': { 'minecraft:is_shaking': {} } },
            events: { 'test:charged': { add: { component_groups: ['test:charged_group'] } } }
        }
    };

    it('lets a damage sensor cancel damage by cause', () => {
        const { types } = load(creeper);
        const entity = types.spawn('test:creeper');

        expect(entity.damage({ cause: 'fall', amount: 6 })).toEqual({
            amount: 0,
            health: 20,
            died: false,
            events: []
        });
        expect(entity.damage({ cause: 'entity_attack', amount: 6 })).toEqual({
            amount: 6,
            health: 14,
            died: false,
            events: []
        });
    });

    it('fires the event a damage sensor names, applied on the next tick', () => {
        const { types } = load(creeper);
        const entity = types.spawn('test:creeper');

        entity.damage({ cause: 'lightning', amount: 5 });
        expect(entity.hasComponent('minecraft:is_shaking')).toBe(false);

        entity.tick();

        expect(entity.hasComponent('minecraft:is_shaking')).toBe(true);
    });

    it('senses a blow without queuing its event or touching the health', () => {
        const { types } = load(creeper);
        const entity = types.spawn('test:creeper');

        expect(entity.senseDamage({ cause: 'lightning', amount: 5 })).toEqual({
            amount: 0,
            multiplier: 0,
            blocked: true,
            events: ['test:charged']
        });
        expect(entity.queued()).toEqual([]);
        expect(entity.attributes.get('health')?.current).toBe(20);

        const result = entity.applyDamage({ cause: 'lightning', amount: 5 }, 0, ['test:charged']);
        expect(result).toEqual({ amount: 0, health: 20, died: false, events: ['test:charged'] });
        entity.tick();
        expect(entity.hasComponent('minecraft:is_shaking')).toBe(true);
    });

    it('hands component damage to the environment when it routes damage', () => {
        const routed: string[] = [];
        const { types } = load(creeper);
        const entity = types.spawn('test:creeper', {
            environment: {
                damage: (_entity, event) => {
                    routed.push(`${event.cause}:${event.amount}`);
                    return { amount: 0, died: false, events: [] };
                }
            }
        });

        entity.damage({ cause: 'drowning', amount: 2 });

        expect(routed).toEqual(['drowning:2']);
        expect(entity.attributes.get('health')?.current).toBe(20);
    });
});

describe('environment sensors', () => {
    const amphibian = {
        format_version: '1.26.50',
        'minecraft:entity': {
            description: { identifier: 'test:amphibian' },
            components: {
                'minecraft:environment_sensor': {
                    triggers: [{ filters: { test: 'in_water', operator: '==', value: true }, event: 'test:soaked' }]
                }
            },
            component_groups: { 'test:wet': {} },
            events: { 'test:soaked': { add: { component_groups: ['test:wet'] } } }
        }
    };

    it('fires its event only while the filters pass', () => {
        let wet = false;
        const { types } = load(amphibian);
        const entity = types.spawn('test:amphibian', {
            environment: {
                filterContext: () => ({ self: { flag: (name) => (name === 'in_water' ? wet : undefined) } })
            }
        });

        entity.tick();
        entity.tick();
        expect(entity.activeComponentGroups()).toEqual([]);

        wet = true;
        entity.tick();
        entity.tick();

        expect(entity.activeComponentGroups()).toEqual(['test:wet']);
    });
});

describe('state observers', () => {
    /** An environment that records every attribute, property and group write, in order. */
    const recording = () => {
        const writes: { kind: string; write: unknown }[] = [];
        const environment: EntityEnvironment = {
            random: scripted(0, 0),
            attributeWritten: (_entity, write) => writes.push({ kind: 'attribute', write }),
            propertyWritten: (_entity, write) => writes.push({ kind: 'property', write }),
            componentGroupsWritten: (_entity, write) => writes.push({ kind: 'groups', write })
        };
        return { writes, environment };
    };

    /** What an undo has to restore: groups, attributes and properties. */
    const stateOf = (entity: EntityInstance) => ({
        groups: entity.activeComponentGroups(),
        attributes: entity.attributes.names().map((name) => [name, entity.attributes.get(name)]),
        properties: entity.properties.names().map((name) => [name, entity.properties.get(name)])
    });

    it('reports an attribute change with its value before and after, and not a write that changes nothing', () => {
        const { writes, environment } = recording();
        const entity = spawn(environment);
        writes.length = 0;

        entity.attributes.set('health', 12);
        entity.attributes.set('health', 12);

        expect(writes).toEqual([
            {
                kind: 'attribute',
                write: {
                    name: 'health',
                    before: { base: 20, min: 0, max: 20, current: 20 },
                    after: { base: 20, min: 0, max: 20, current: 12 }
                }
            }
        ]);
    });

    it('reports a property write that changed the value', () => {
        const { writes, environment } = recording();
        const entity = spawn(environment);
        writes.length = 0;

        entity.properties.set('minecraft:state', 'hostile_observed');
        entity.properties.set('minecraft:state', 'hostile_observed');

        expect(writes).toEqual([
            {
                kind: 'property',
                write: { name: 'minecraft:state', before: 'neutral', after: 'hostile_observed' }
            }
        ]);
    });

    it('reports a group change after the attribute writes its rebuild made', () => {
        const { writes, environment } = recording();
        const entity = spawn(environment);
        writes.length = 0;

        entity.raise('minecraft:as_baby', 'self', 'test');
        entity.applyQueuedEvents();

        expect(writes.map(({ kind }) => kind).at(-1)).toBe('groups');
        expect(writes.at(-1)?.write).toEqual({
            before: ['minecraft:zombie_adult', 'minecraft:can_break_doors'],
            after: ['minecraft:can_break_doors', 'minecraft:zombie_baby']
        });
        expect(writes.some(({ kind, write }) => kind === 'attribute' && isMovement(write))).toBe(true);
    });

    it('undoes a group change exactly from the reported before-values, newest first', () => {
        const { writes, environment } = recording();
        const entity = spawn(environment);
        entity.attributes.set('health', 7);
        const before = stateOf(entity);
        writes.length = 0;

        entity.raise('minecraft:as_baby', 'self', 'test');
        entity.applyQueuedEvents();
        entity.properties.set('minecraft:state', 'hostile_observed');
        const recorded = [...writes].reverse();
        expect(stateOf(entity)).not.toEqual(before);

        for (const { kind, write } of recorded) {
            if (kind === 'groups' && isGroupsWrite(write)) {
                const attributes = entity.attributes
                    .names()
                    .map((name) => [name, entity.attributes.get(name)] as const);
                entity.restoreComponentGroups(write.before);
                for (const [name, attribute] of attributes) entity.attributes.restore(name, attribute ?? null);
            } else if (kind === 'attribute' && isAttributeWrite(write))
                entity.attributes.restore(write.name, write.before);
            else if (kind === 'property' && isPropertyWrite(write)) entity.properties.set(write.name, write.before);
        }

        expect(stateOf(entity)).toEqual(before);
    });
});

const isMovement = (write: unknown): boolean =>
    typeof write === 'object' && write !== null && 'name' in write && write.name === 'movement';

const isGroupsWrite = (write: unknown): write is ComponentGroupsWrite =>
    typeof write === 'object' && write !== null && 'before' in write && Array.isArray(write.before);

const isAttributeWrite = (write: unknown): write is AttributeWrite =>
    typeof write === 'object' && write !== null && 'name' in write && 'before' in write && !Array.isArray(write.before);

const isPropertyWrite = (write: unknown): write is PropertyValueWrite =>
    typeof write === 'object' && write !== null && 'name' in write && 'before' in write;
