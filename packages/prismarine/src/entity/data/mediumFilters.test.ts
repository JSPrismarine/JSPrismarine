import { describe, expect, it } from 'vitest';

import { FLOOR_Y, TestEntityWorld, entityFixture } from './testing';

/** A skeleton's powder snow sensor, as Mojang's pack writes it. */
const shiverer = {
    components: {
        'minecraft:health': { value: 20, max: 20 },
        'minecraft:collision_box': { width: 0.6, height: 1.9 },
        'minecraft:environment_sensor': {
            triggers: [
                {
                    filters: { test: 'in_block', subject: 'self', value: 'minecraft:powder_snow' },
                    event: 'test:in_snow'
                }
            ]
        }
    },
    component_groups: { 'test:in_snow': { 'minecraft:is_shaking': {} } },
    events: { 'test:in_snow': { add: { component_groups: ['test:in_snow'] } } }
};

/** An axolotl's land sensor, as Mojang's pack writes it. */
const stranded = {
    components: {
        'minecraft:health': { value: 14, max: 14 },
        'minecraft:collision_box': { width: 0.75, height: 0.42 },
        'minecraft:environment_sensor': {
            triggers: [{ filters: { test: 'in_water', operator: '!=', value: true }, event: 'test:on_land' }]
        }
    },
    component_groups: { 'test:on_land': { 'minecraft:is_shaking': {} } },
    events: { 'test:on_land': { add: { component_groups: ['test:on_land'] } } }
};

const standIn = (block: string | undefined, identifier = 'test:shiverer') => {
    const world = new TestEntityWorld();
    const fixture = entityFixture(world, {}, { 'test:shiverer': shiverer, 'test:stranded': stranded });
    if (block !== undefined) for (const dy of [0, 1]) world.setBlock({ x: 0, y: FLOOR_Y + 1 + dy, z: 0 }, block);
    const entity = fixture.runtime.spawn(identifier, { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
    if (entity === undefined) throw new Error(`the fixture declares ${identifier}`);
    for (let tick = 1; tick <= 3; tick += 1) {
        world.advance();
        fixture.runtime.tick(tick);
    }
    return entity;
};

describe('the in_water filter', () => {
    it('answers false out of water, so a sensor testing in_water != true fires on land', () => {
        expect(standIn(undefined, 'test:stranded').instance.hasComponent('minecraft:is_shaking')).toBe(true);
    });

    it('answers true in water', () => {
        expect(standIn('minecraft:water', 'test:stranded').instance.hasComponent('minecraft:is_shaking')).toBe(false);
    });
});

describe('the in_block filter', () => {
    it("names the block the entity's feet are in", () => {
        expect(standIn('minecraft:powder_snow').instance.hasComponent('minecraft:is_shaking')).toBe(true);
    });

    it('answers false for any other block', () => {
        expect(standIn(undefined).instance.hasComponent('minecraft:is_shaking')).toBe(false);
    });
});
