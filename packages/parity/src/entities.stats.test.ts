import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';
import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import { loadJavaEntityAttributes } from './goldens.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';
import { loadVanillaEntityTypes } from './vanillaEntities.ts';

/**
 * Phase 3's stat cross-check: the health the vanilla entity components give a mob against the
 * value Java's attribute supplier holds for the same mob.
 *
 * Health is the one attribute both editions write in the same unit, half a heart, so it is the
 * one a raw value comparison means something for. Bedrock's `minecraft:movement` and
 * `minecraft:flying_speed` are not Java's `movement_speed` and `flying_speed` in the same
 * units - a Bedrock axolotl moves at 0.1 where Java's attribute is 1.0 - and `follow_range`
 * defaults to 1024 in Bedrock's JSON where Java's is 16. Comparing those raw would report
 * arithmetic, not parity, so this row leaves them to a slice that establishes the conversion
 * and says so rather than reporting a green it did not earn.
 *
 * Gap ids: `no-definition:<bedrock id>` for a Java mob the vanilla pack has no entity for,
 * `no-health:<bedrock id>` for one whose definition declares no health, and
 * `health:<bedrock id>` where the two editions disagree on the value.
 */
const compareEntityStats = (): { gaps: string[]; compared: number; detail: string[] } => {
    const java = loadJavaEntityAttributes();
    const types = loadVanillaEntityTypes();
    const gaps: string[] = [];
    const detail: string[] = [];
    let compared = 0;

    for (const [javaId, row] of Object.entries(java)) {
        const javaHealth = row.attributes['minecraft:max_health'];
        if (javaHealth === undefined) continue;

        const mapped = javaEntityTypeToBedrock(javaId);
        if (mapped.kind !== 'mapped') continue;

        let health: number | undefined;
        try {
            health = types.spawn(mapped.bedrock).attributes.get('health')?.base;
        } catch {
            gaps.push(`no-definition:${mapped.bedrock}`);
            continue;
        }
        if (health === undefined) {
            gaps.push(`no-health:${mapped.bedrock}`);
            continue;
        }

        compared += 1;
        if (health === javaHealth) continue;
        gaps.push(`health:${mapped.bedrock}`);
        detail.push(`${mapped.bedrock}: Bedrock ${health}, Java ${javaHealth} (${javaId})`);
    }

    return { gaps, compared, detail };
};

describeFamily(FAMILIES.entitiesStats, [REFERENCES.javaEntityAttributes, REFERENCES.bedrockBehaviorPack], () => {
    const { gaps, compared, detail } = compareEntityStats();
    const verdict = checkAllowList(FAMILIES.entitiesStats, gaps);

    it('gives every mob the health Java gives it', () => {
        expect(verdict.unexpected, detail.join('\n')).toEqual([]);
    });

    it('carries no stale allow-list entry', () => {
        expect(verdict.stale).toEqual([]);
    });

    it('reads the whole Java attribute dump: 93 types, 40 attributes, 2619 values', () => {
        const java = loadJavaEntityAttributes();
        const names = new Set(Object.values(java).flatMap((row) => Object.keys(row.attributes)));
        const values = Object.values(java).reduce((sum, row) => sum + Object.keys(row.attributes).length, 0);

        expect(Object.keys(java)).toHaveLength(93);
        expect(names.size).toBe(40);
        expect(values).toBe(2619);
    });

    it('compares most of the dump rather than a handful of mobs', () => {
        // 93 Java types, less the ones with no vanilla Bedrock entity file and the ones whose
        // definition declares no health. A sharp drop means the pack or the mapping moved.
        expect(compared).toBeGreaterThanOrEqual(85);
    });
});
