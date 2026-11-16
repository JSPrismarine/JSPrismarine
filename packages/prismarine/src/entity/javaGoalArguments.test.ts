import { java_entity_attributes, java_entity_goals } from '@jsprismarine/bedrock-data';
import { describe, expect, it } from 'vitest';

import type { ContentTags } from '../content/tags';
import { familyFilter, javaGoalOverlay } from './javaGoalArguments';

const family = (value: string) => ({ test: 'is_family', subject: 'other', operator: '==', value });

const FAMILIES = new Map<string, readonly string[]>([
    ['minecraft:zombie', ['zombie', 'undead', 'monster', 'mob']],
    ['minecraft:husk', ['husk', 'zombie', 'undead', 'monster', 'mob']],
    ['minecraft:cow', ['cow', 'mob']],
    ['minecraft:player', ['player', 'mob']]
]);

describe('familyFilter', () => {
    const filter = familyFilter(FAMILIES);

    it("matches one type by its own family and excludes another type's family that overlaps it", () => {
        expect(filter(new Set(['minecraft:zombie']))).toEqual({
            all_of: [family('zombie'), { none_of: [family('husk')] }]
        });
    });

    it('takes a family that names exactly the wanted types instead of listing each', () => {
        expect(filter(new Set(['minecraft:zombie', 'minecraft:husk']))).toEqual(family('zombie'));
        expect(filter(new Set(FAMILIES.keys()))).toEqual(family('mob'));
    });

    it('lists the families of types no one family names together', () => {
        expect(filter(new Set(['minecraft:cow', 'minecraft:player']))).toEqual({
            any_of: [family('cow'), family('player')]
        });
    });
});

const entityFile = (identifier: string, components: Record<string, unknown>) => ({
    format_version: '1.21.0',
    'minecraft:entity': { description: { identifier }, components }
});

const NO_TAGS: ContentTags = {
    registries: [],
    diagnostics: [],
    has: () => false,
    members: () => [],
    tags: () => [],
    size: 0,
    includes: () => false
};

describe('javaGoalOverlay', () => {
    const files = [...FAMILIES].map(([identifier, families]) =>
        entityFile(identifier, { 'minecraft:type_family': { family: families } })
    );
    const zombie = entityFile('minecraft:zombie', {
        'minecraft:type_family': { family: FAMILIES.get('minecraft:zombie') },
        'minecraft:behavior.look_at_player': { priority: 8, look_distance: 6, probability: 0.02 }
    });
    const overlay = javaGoalOverlay([...files, zombie], {
        goals: java_entity_goals,
        attributes: java_entity_attributes,
        tags: NO_TAGS
    });

    it("writes the look distance Java's zombie passes its player look goal, 8", () => {
        const data = overlay(zombie);
        expect(data).not.toBe(zombie);
        expect(JSON.stringify(data)).toContain('"look_distance":8');
    });

    it("takes off a goal Java's class does not register, and keeps one its own goal stands in for", () => {
        const ghast = entityFile('minecraft:ghast', {
            'minecraft:behavior.float': { priority: 0 },
            'minecraft:behavior.ranged_attack': { priority: 2 }
        });
        const json = JSON.stringify(overlay(ghast));
        expect(json).not.toContain('minecraft:behavior.float');
        expect(json).toContain('minecraft:behavior.ranged_attack');
    });

    it('keeps every goal of a mob whose brain runs in place of them', () => {
        const ghast = entityFile('minecraft:ghast', { 'minecraft:behavior.float': { priority: 0 } });
        const brainOverlay = javaGoalOverlay([ghast], {
            goals: java_entity_goals,
            attributes: java_entity_attributes,
            tags: NO_TAGS,
            brainOnly: new Set(['minecraft:ghast'])
        });
        expect(JSON.stringify(brainOverlay(ghast))).toContain('minecraft:behavior.float');
    });

    it("has a mob Java never walks to items take only what its box, grown by Java's reach, touches", () => {
        const pickup = (identifier: string) =>
            JSON.stringify(
                overlay(entityFile(identifier, { 'minecraft:behavior.pickup_items': { max_dist: 3, goal_radius: 2 } }))
            );
        // A zombie is 0.6 across: 0.3 to its side, 1 of reach and half of the item's 0.25.
        expect(pickup('minecraft:zombie')).toContain('"max_dist":1.425,"goal_radius":1.425');
        // A fox searches for items, so it walks to them as far as its file says.
        expect(pickup('minecraft:fox')).toContain('"max_dist":3,"goal_radius":2');
    });

    it('leaves a file whose entity has no Java goals as it is', () => {
        const file = entityFile('minecraft:armor_stand', { 'minecraft:behavior.look_at_player': { look_distance: 6 } });
        expect(overlay(file)).toBe(file);
    });
});

describe('familyFilter with components', () => {
    const families = new Map<string, readonly string[]>([
        ['minecraft:wither_skeleton', ['wither', 'skeleton', 'monster', 'mob']],
        ['minecraft:skeleton', ['skeleton', 'monster', 'mob']],
        ['minecraft:wither', ['wither', 'skeleton', 'monster', 'mob']],
        ['minecraft:ender_dragon', ['dragon', 'mob']]
    ]);
    const components = new Map<string, readonly string[]>([
        ['minecraft:wither_skeleton', ['minecraft:health']],
        ['minecraft:skeleton', ['minecraft:health']],
        ['minecraft:wither', ['minecraft:health', 'minecraft:boss', 'minecraft:can_fly']],
        ['minecraft:ender_dragon', ['minecraft:boss', 'minecraft:can_fly', 'minecraft:health']]
    ]);

    it('excludes a type that carries every family a wanted type does by a component of its own', () => {
        const filter = familyFilter(families, components);
        expect(filter(new Set(['minecraft:wither_skeleton', 'minecraft:skeleton']))).toEqual({
            all_of: [
                family('skeleton'),
                { none_of: [{ test: 'has_component', subject: 'other', operator: '==', value: 'minecraft:boss' }] }
            ]
        });
    });

    it('accepts such a type when it reads no components', () => {
        expect(familyFilter(families)(new Set(['minecraft:wither_skeleton', 'minecraft:skeleton']))).toEqual(
            family('skeleton')
        );
    });
});
