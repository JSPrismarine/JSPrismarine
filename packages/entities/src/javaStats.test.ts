import { describe, expect, it } from 'vitest';

import type { AttributeName } from './attributes';
import { Attributes } from './attributes';
import type { JavaStatSource } from './javaStats';
import { JAVA_STAT_EXCEPTIONS, SHARED_STATS, javaAttributeBases, javaEntityStats, statRuling } from './javaStats';

/** Two entities out of the real table, with only the attributes these tests read. */
const source: JavaStatSource = {
    'minecraft:wither': {
        width: 0.9,
        height: 3.5,
        attributes: {
            'minecraft:max_health': 300,
            'minecraft:movement_speed': 0.6,
            'minecraft:follow_range': 40,
            'minecraft:knockback_resistance': 1
        }
    },
    'minecraft:horse': {
        width: 1.3964844,
        height: 1.5,
        attributes: { 'minecraft:max_health': 53, 'minecraft:movement_speed': 0.225 }
    }
};

/** The five types Bedrock spawns under a name Java does not use, with Java's follow range. */
const renamed: JavaStatSource = {
    'minecraft:evoker': { width: 0.6, height: 1.95, attributes: { 'minecraft:follow_range': 12 } },
    'minecraft:villager': { width: 0.6, height: 1.95, attributes: { 'minecraft:follow_range': 16 } },
    'minecraft:zombie_villager': { width: 0.6, height: 1.95, attributes: { 'minecraft:follow_range': 35 } },
    'minecraft:tropical_fish': { width: 0.5, height: 0.4, attributes: { 'minecraft:follow_range': 16 } },
    'minecraft:zombified_piglin': { width: 0.6, height: 1.95, attributes: { 'minecraft:follow_range': 35 } }
};

describe('javaAttributeBases', () => {
    it("takes Java Edition's value for the stats Java decides", () => {
        const bases = javaAttributeBases('minecraft:wither', source);

        expect(bases.get('health')).toBe(300);
        expect(bases.get('follow_range')).toBe(40);
        expect(bases.get('knockback_resistance')).toBe(1);
    });

    it('leaves the stats Bedrock decides to the pack', () => {
        const bases = javaAttributeBases('minecraft:wither', source);

        expect(bases.has('movement')).toBe(false);
        expect(bases.has('flying_speed')).toBe(false);
    });

    it('leaves a reviewed exception to the pack', () => {
        const bases = javaAttributeBases('minecraft:horse', source);

        expect(bases.has('health')).toBe(false);
    });

    it('overrides nothing for an entity Java does not publish', () => {
        expect(javaAttributeBases('minecraft:allay', source).size).toBe(0);
        expect(javaAttributeBases('minecraft:wither', undefined).size).toBe(0);
    });
});

describe('Attributes with Java bases', () => {
    it('replaces the base and the maximum a component declared', () => {
        const attributes = new Attributes(javaAttributeBases('minecraft:wither', source));

        const health = attributes.define('health', { base: 600, max: 600 });

        expect(health).toEqual({ base: 300, min: 0, max: 300, current: 300 });
    });

    it("collapses a Bedrock damage range onto Java's one number", () => {
        const attributes = new Attributes(new Map<AttributeName, number>([['attack_damage', 5]]));

        expect(attributes.define('attack_damage', { base: 3, max: 9 })).toMatchObject({ base: 5, max: 5 });
    });

    it('keeps the declared value for an attribute nothing overrides', () => {
        const attributes = new Attributes(javaAttributeBases('minecraft:wither', source));

        expect(attributes.define('movement', { base: 0.25 }).base).toBe(0.25);
    });

    it('applies the override again when a component group redeclares the stat', () => {
        const attributes = new Attributes(new Map<AttributeName, number>([['health', 300]]));

        attributes.define('health', { base: 600, max: 600 });
        attributes.set('health', 10);

        expect(attributes.define('health', { base: 450, max: 450 }).current).toBe(300);
    });
});

describe('statRuling', () => {
    it('names the edition that decides each stat', () => {
        expect(statRuling('minecraft:wither', 'max_health').kind).toBe('java');
        expect(statRuling('minecraft:wither', 'height').kind).toBe('bedrock');
        expect(statRuling('minecraft:horse', 'max_health').kind).toBe('exception');
    });

    it('gives a reason for every ruling, so a parity row can quote one', () => {
        for (const row of JAVA_STAT_EXCEPTIONS) {
            expect(statRuling(row.identifier, row.stat)).toEqual({ kind: 'exception', reason: row.reason });
        }
        for (const [stat, authority] of Object.entries(SHARED_STATS)) {
            expect(authority.reason.length).toBeGreaterThan(0);
            expect(statRuling('minecraft:nothing', stat as keyof typeof SHARED_STATS).reason).toBe(authority.reason);
        }
    });

    it('lists no exception on a stat Bedrock already decides', () => {
        for (const row of JAVA_STAT_EXCEPTIONS) expect(SHARED_STATS[row.stat].decidedBy).toBe('java');
    });
});
