import { describe, expect, it } from 'vitest';

import blockPropertiesJson from './jsp/java/block_properties.json';
import entityAttributesJson from './jsp/java/entity_attributes.json';

/**
 * Validates the Java Edition goldens that `utils/java-dump/run.mjs` captures from the pinned
 * 26.3 server jar. The expected counts are the measurements in
 * docs/research/java-code-only-behavior.md; a Java version bump refreshes the goldens and these
 * numbers together.
 */

interface BlockEntry {
    stateCount: number;
    base: Record<string, unknown>;
    stateOverrides?: Record<string, Record<string, unknown>>;
}

interface EntityEntry {
    category: string;
    width: number;
    height: number;
    attributes: Record<string, number>;
}

// The imported JSON is too large for useful literal inference; these casts give it the shape
// the dumper writes, which the structural assertions below then verify.
const blocks = blockPropertiesJson as Record<string, BlockEntry>;
const entities = entityAttributesJson as Record<string, EntityEntry>;

const blockEntries = Object.entries(blocks);
const entityEntries = Object.entries(entities);

const numberFields = [
    'hardness',
    'blastResistance',
    'friction',
    'speedFactor',
    'jumpFactor',
    'bounceRestitution',
    'fallDistanceReduction',
    'lightEmission',
    'lightDampening',
    'igniteOdds',
    'burnOdds'
];
const stringFields = ['mapColor', 'soundType', 'pushReaction', 'instrument'];
const booleanFields = ['requiresCorrectTool', 'randomTick'];
const stateVariantFields = new Set([
    'hardness',
    'lightEmission',
    'lightDampening',
    'mapColor',
    'soundType',
    'pushReaction',
    'instrument',
    'requiresCorrectTool',
    'randomTick'
]);

describe('block_properties.json', () => {
    it('covers all 1286 blocks and 35723 states', () => {
        expect(blockEntries.length).toBe(1286);
        const states = blockEntries.reduce((sum, [, entry]) => sum + entry.stateCount, 0);
        expect(states).toBe(35723);
    });

    it('gives every block a complete, well-typed base row', () => {
        for (const [id, entry] of blockEntries) {
            expect(id).toMatch(/^minecraft:[a-z0-9_]+$/);
            expect(entry.stateCount).toBeGreaterThanOrEqual(1);
            for (const field of numberFields) {
                expect(typeof entry.base[field], `${id} ${field}`).toBe('number');
            }
            for (const field of stringFields) {
                expect(typeof entry.base[field], `${id} ${field}`).toBe('string');
            }
            for (const field of booleanFields) {
                expect(typeof entry.base[field], `${id} ${field}`).toBe('boolean');
            }
            expect(Object.keys(entry.base).length).toBe(
                numberFields.length + stringFields.length + booleanFields.length
            );
        }
    });

    it('keeps overrides to the per-state fields, differing from the base', () => {
        for (const [id, entry] of blockEntries) {
            for (const [stateKey, override] of Object.entries(entry.stateOverrides ?? {})) {
                expect(stateKey, `${id} ${stateKey}`).toMatch(/^[a-z0-9_]+=[^,]+(,[a-z0-9_]+=[^,]+)*$/);
                expect(Object.keys(override).length).toBeGreaterThan(0);
                for (const [field, value] of Object.entries(override)) {
                    expect(stateVariantFields.has(field), `${id} ${stateKey} ${field}`).toBe(true);
                    expect(value, `${id} ${stateKey} ${field}`).not.toEqual(entry.base[field]);
                }
            }
        }
    });

    it('matches the research note counts for the flagged blocks', () => {
        const count = (matches: (entry: BlockEntry) => boolean) =>
            blockEntries.filter(([, entry]) => matches(entry)).length;
        const anyState = (entry: BlockEntry, field: string, matches: (value: unknown) => boolean) =>
            matches(entry.base[field]) ||
            Object.values(entry.stateOverrides ?? {}).some((override) => field in override && matches(override[field]));

        // 470 blocks require the correct tool in at least one state.
        expect(count((entry) => anyState(entry, 'requiresCorrectTool', (value) => value === true))).toBe(470);
        // 110 blocks tick randomly in their default state; redstone ore and deepslate redstone
        // ore additionally tick only while lit, so the any-state count is 112.
        expect(count((entry) => entry.base.randomTick === true)).toBe(110);
        expect(count((entry) => anyState(entry, 'randomTick', (value) => value === true))).toBe(112);
        // 56 blocks emit light in their default state.
        expect(count((entry) => (entry.base.lightEmission as number) > 0)).toBe(56);
        // 254 blocks have fire ignite or burn odds.
        expect(count((entry) => (entry.base.igniteOdds as number) > 0 || (entry.base.burnOdds as number) > 0)).toBe(
            254
        );
        // 24 blocks deviate from the default friction, speed factor, jump factor or bounce.
        expect(
            count(
                (entry) =>
                    entry.base.friction !== 0.6 ||
                    entry.base.speedFactor !== 1 ||
                    entry.base.jumpFactor !== 1 ||
                    entry.base.bounceRestitution !== 0 ||
                    entry.base.fallDistanceReduction !== 0
            )
        ).toBe(24);
    });

    it('holds the Java values Bedrock component grammar cannot', () => {
        expect(blocks['minecraft:blue_ice']?.base.friction).toBe(0.989);
        expect(blocks['minecraft:soul_sand']?.base.speedFactor).toBe(0.4);
        expect(blocks['minecraft:honey_block']?.base.jumpFactor).toBe(0.5);
        expect(blocks['minecraft:slime_block']?.base.bounceRestitution).toBe(1);
    });
});

describe('entity_attributes.json', () => {
    it('covers the 93 entity types with default attribute suppliers and their 2619 values', () => {
        expect(entityEntries.length).toBe(93);
        const values = entityEntries.reduce((sum, [, entry]) => sum + Object.keys(entry.attributes).length, 0);
        expect(values).toBe(2619);
    });

    it('gives every entity a category, dimensions and numeric attributes', () => {
        for (const [id, entry] of entityEntries) {
            expect(id).toMatch(/^minecraft:[a-z0-9_]+$/);
            expect(typeof entry.category, `${id} category`).toBe('string');
            expect(entry.width, `${id} width`).toBeGreaterThan(0);
            expect(entry.height, `${id} height`).toBeGreaterThan(0);
            expect(Object.keys(entry.attributes).length, `${id} attributes`).toBeGreaterThan(0);
            for (const [attribute, value] of Object.entries(entry.attributes)) {
                expect(attribute).toMatch(/^minecraft:[a-z0-9_.]+$/);
                expect(typeof value, `${id} ${attribute}`).toBe('number');
            }
        }
    });

    it('matches Java default values spot-checked in the research note', () => {
        const zombie = entities['minecraft:zombie'];
        expect(zombie?.attributes['minecraft:max_health']).toBe(20);
        expect(zombie?.attributes['minecraft:attack_damage']).toBe(3);
        // Mojang passes the literal 0.23F into a double-valued attribute, so the stored value is
        // the widened float, 0.23000000417232513.
        expect(zombie?.attributes['minecraft:movement_speed']).toBeCloseTo(0.23, 7);
        expect(zombie?.category).toBe('monster');
        const cow = entities['minecraft:cow'];
        expect(cow?.attributes['minecraft:max_health']).toBe(10);
        expect(cow?.width).toBe(0.9);
        expect(cow?.height).toBe(1.4);
    });
});
