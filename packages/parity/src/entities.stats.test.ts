import type { EntityInstance, SharedStat } from '@jsprismarine/entities';
import { JAVA_STAT_EXCEPTIONS, SHARED_STATS, statRuling } from '@jsprismarine/entities';
import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';
import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import { loadJavaEntityAttributes } from './goldens.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';
import { loadVanillaEntityTypes } from './vanillaEntities.ts';

/**
 * Phase 3's stat cross-check: every stat both editions publish for the same mob, measured on
 * the entity the server spawns rather than on the pack's JSON.
 *
 * Nine stats are published on both sides, and the two editions disagree on 151 of the 438 rows.
 * [ADR 0001](../../../docs/adr/0001-entity-stat-authority.md) settles each one per stat: Java
 * decides `max_health`, `attack_damage`, `follow_range` and `knockback_resistance`, Bedrock
 * decides the five the client predicts or draws with, and fifteen reviewed rows keep Bedrock's
 * value inside a Java-decided stat. `@jsprismarine/entities` holds that decision, applies it
 * when it spawns an entity, and exposes it as `statRuling`, so this row derives its verdict
 * from the decision instead of keeping a second copy of it.
 *
 * A disagreement that survives the spawn is read through `statRuling`. A `bedrock` or
 * `exception` ruling is an accepted divergence and carries the decision's own reason onto the
 * dashboard; a `java` ruling means the server should already be running Java's number and is
 * not, which is a defect.
 *
 * Gap ids: `no-definition:<bedrock id>` for a Java mob the vanilla pack has no entity for, and
 * `<stat>:<bedrock id>` for a stat the two editions still disagree on after the spawn. A stat
 * only one edition publishes is not compared at all - Mojang's `player.json` declares no health
 * component, so the player contributes no `max_health` row.
 */

/** What one measured row holds: the value the server spawns with against Java's. */
interface MeasuredStat {
    readonly bedrockId: string;
    readonly javaId: string;
    readonly stat: SharedStat;
    /** The value the entity the server spawned carries. */
    readonly server: number;
    /** The value Java's attribute supplier dump holds. */
    readonly java: number;
}

/** Whether a parsed `minecraft:collision_box` body carries both sides of the hitbox. */
const isCollisionBox = (value: unknown): value is { readonly width: number; readonly height: number } =>
    typeof value === 'object' && value !== null && 'width' in value && 'height' in value;

/**
 * Whether two stats are the same number.
 *
 * Both editions write these as decimals, so a relative tolerance keeps a float round trip such
 * as 0.30000001192092896 from reading as a disagreement.
 */
const agrees = (left: number, right: number): boolean =>
    Math.abs(left - right) <= Math.max(1e-5, Math.abs(right) * 1e-5);

/** The nine stat names, read off the decision rather than written out a second time. */
const isSharedStat = (value: string): value is SharedStat => value in SHARED_STATS;
const sharedStats = (): readonly SharedStat[] => Object.keys(SHARED_STATS).filter(isSharedStat);

const compareEntityStats = (): {
    gaps: string[];
    measured: MeasuredStat[];
    disagreements: MeasuredStat[];
    detail: string[];
} => {
    const java = loadJavaEntityAttributes();
    const types = loadVanillaEntityTypes();
    const gaps: string[] = [];
    const measured: MeasuredStat[] = [];

    for (const [javaId, row] of Object.entries(java)) {
        const mapped = javaEntityTypeToBedrock(javaId);
        if (mapped.kind !== 'mapped') continue;

        // The server spawns with the Java stat table in the environment, which is what applies
        // the decision, so this measures the entity an operator's world would hold.
        let entity: EntityInstance;
        try {
            entity = types.spawn(mapped.bedrock, {
                environment: { random: { next: () => 0 }, javaStats: java }
            });
        } catch {
            gaps.push(`no-definition:${mapped.bedrock}`);
            continue;
        }

        const box = entity.componentParams('minecraft:collision_box');
        const hitbox = isCollisionBox(box) ? box : undefined;

        for (const stat of sharedStats()) {
            const authority = SHARED_STATS[stat];
            // The hitbox is the one pair the Java dump holds outside its attribute map, and
            // the server reads it off `minecraft:collision_box` rather than an attribute.
            const pair =
                stat === 'width' || stat === 'height'
                    ? { server: hitbox?.[stat], java: row[stat] }
                    : {
                          server:
                              authority.attribute === undefined
                                  ? undefined
                                  : entity.attributes.get(authority.attribute)?.base,
                          java:
                              authority.javaAttribute === undefined
                                  ? undefined
                                  : row.attributes[authority.javaAttribute]
                      };

            if (pair.server === undefined || pair.java === undefined) continue;
            measured.push({ bedrockId: mapped.bedrock, javaId, stat, server: pair.server, java: pair.java });
        }
    }

    const disagreements = measured.filter((row) => !agrees(row.server, row.java));
    for (const row of disagreements) gaps.push(`${row.stat}:${row.bedrockId}`);

    const detail = disagreements
        .filter((row) => statRuling(row.bedrockId, row.stat).kind === 'java')
        .map((row) => `${row.bedrockId} ${row.stat}: server ${row.server}, Java ${row.java} (${row.javaId})`);

    return { gaps, measured, disagreements, detail };
};

describeFamily(FAMILIES.entitiesStats, [REFERENCES.javaEntityAttributes, REFERENCES.bedrockBehaviorPack], () => {
    const { gaps, measured, disagreements, detail } = compareEntityStats();
    const verdict = checkAllowList(FAMILIES.entitiesStats, gaps);

    it('runs every mob on the value the stat decision gives it', () => {
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

    it('compares all nine shared stats across the whole dump, not health alone', () => {
        // The ADR counts 438 shared stats. 423 are a type both editions spell the same way;
        // the other 15 belong to the five types Bedrock keeps a legacy identifier for, which
        // this row reaches through `javaEntityTypeToBedrock`: evocation_illager, villager_v2,
        // zombie_villager_v2, tropicalfish and zombie_pigman.
        expect(measured).toHaveLength(438);
        expect(new Set(measured.map((row) => row.stat)).size).toBe(Object.keys(SHARED_STATS).length);
        expect(new Set(measured.map((row) => row.bedrockId)).size).toBeGreaterThanOrEqual(85);
    });

    it('leaves every surviving disagreement to a stat Bedrock decides or a reviewed row', () => {
        // 103 are stats the client predicts or draws with. The rest are the ADR's reviewed
        // exceptions, one measured row each, so that count is read off the decision and drops
        // when an exception stops disagreeing. Nothing is left for the decision to give to
        // Java: a row that ruled that way would be a stat the server should already run
        // Java's number for, and `detail` names it.
        const kinds = disagreements.map((row) => statRuling(row.bedrockId, row.stat).kind);

        expect(detail).toEqual([]);
        expect(kinds.filter((kind) => kind === 'bedrock')).toHaveLength(103);
        expect(kinds.filter((kind) => kind === 'exception')).toHaveLength(JAVA_STAT_EXCEPTIONS.length);
        expect(disagreements).toHaveLength(103 + JAVA_STAT_EXCEPTIONS.length);
    });
});
