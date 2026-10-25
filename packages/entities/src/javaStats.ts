/**
 * Which edition decides a stat both editions publish, and the reviewed rows
 * that go the other way.
 *
 * Bedrock's entity definitions and Java Edition's attribute suppliers publish
 * 438 of the same stats, and they disagree on 151. Taking the Bedrock number
 * everywhere would give up Java's gameplay rules; taking the Java number
 * everywhere would hand the Bedrock client a hitbox that does not match the
 * model it draws. The decision is per stat, and it is recorded in
 * [ADR 0001](../../../docs/adr/0001-entity-stat-authority.md) and in decision
 * 11 of [the data-driven plan](../../../docs/plans/data-driven-vanilla.md).
 */

import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';

import type { AttributeName } from './attributes';

/** A stat both editions publish for the same entity. */
export type SharedStat =
    | 'attack_damage'
    | 'flying_speed'
    | 'follow_range'
    | 'height'
    | 'jump_strength'
    | 'knockback_resistance'
    | 'max_health'
    | 'movement_speed'
    | 'width';

/** Which edition decides one shared stat. */
export interface StatAuthority {
    /** The edition whose value the server runs with. */
    readonly decidedBy: 'bedrock' | 'java';
    /** The attribute the stat lands on, absent for the two hitbox stats. */
    readonly attribute?: AttributeName;
    /** The key the Java attribute dump holds it under, absent for the two hitbox stats. */
    readonly javaAttribute?: string;
    /** Why that edition decides it. */
    readonly reason: string;
}

/**
 * The edition that decides each shared stat.
 *
 * Java decides the four a Bedrock client never simulates: it draws hearts from
 * the health attribute, computes no damage of its own, and runs no mob AI. Bedrock
 * decides the five that reach the client's own simulation.
 * `ClientMovementPredictionSyncPacket` enumerates what the client predicts an
 * actor with, and the bounding box, the movement speeds and the jump strength
 * are all on that list.
 */
export const SHARED_STATS: Readonly<Record<SharedStat, StatAuthority>> = {
    max_health: {
        decidedBy: 'java',
        attribute: 'health',
        javaAttribute: 'minecraft:max_health',
        reason: 'The server owns every hit point. The client draws hearts from the health attribute the server sends it and never computes one.'
    },
    attack_damage: {
        decidedBy: 'java',
        attribute: 'attack_damage',
        javaAttribute: 'minecraft:attack_damage',
        reason: 'A Bedrock client reports that a swing happened and at whom, and carries no damage field. The server computes the number.'
    },
    follow_range: {
        decidedBy: 'java',
        attribute: 'follow_range',
        javaAttribute: 'minecraft:follow_range',
        reason: 'Row 227 of the edition-differences note classifies follow range as server-decided and invisible. The Bedrock client runs no mob AI, so nothing it draws depends on the number.'
    },
    knockback_resistance: {
        decidedBy: 'java',
        attribute: 'knockback_resistance',
        javaAttribute: 'minecraft:knockback_resistance',
        reason: "Knockback reaches a mob as a server-sent position delta, so the resistance that scales it is the server's alone."
    },
    movement_speed: {
        decidedBy: 'bedrock',
        attribute: 'movement',
        javaAttribute: 'minecraft:movement_speed',
        reason: 'The Java dump cannot tell a declared speed from the inherited 0.7 default, which 17 of the 93 types carry, and the client predicts the speed of a mob the player rides.'
    },
    flying_speed: {
        decidedBy: 'bedrock',
        attribute: 'flying_speed',
        javaAttribute: 'minecraft:flying_speed',
        reason: 'Same as movement speed. The flying move controls scale the attribute differently in the two editions, and the happy ghast is ridden.'
    },
    jump_strength: {
        decidedBy: 'bedrock',
        attribute: 'jump_strength',
        javaAttribute: 'minecraft:jump_strength',
        reason: 'Jump strength is one of the movement attributes `ClientMovementPredictionSyncPacket` carries, so the client predicts a ridden mount with it.'
    },
    width: {
        decidedBy: 'bedrock',
        reason: 'The client draws the mob from its own model and collides with the box the server sends in actor data 53 and 54. A box that disagrees with the model means aiming at a mob and missing.'
    },
    height: {
        decidedBy: 'bedrock',
        reason: 'Same as width. Row 168 classifies entity hitboxes as mixed and visibly broken, and exclusion 5 of the parity claim names them.'
    }
};

/** One entity and stat that keeps Bedrock's value inside a Java-decided stat. */
export interface JavaStatException {
    /** The entity identifier, such as `minecraft:wither`. */
    readonly identifier: string;
    readonly stat: SharedStat;
    /** Why Java's dumped number is not Java's behavior for this entity. */
    readonly reason: string;
}

/**
 * The rows that keep Bedrock's value inside a stat Java decides.
 *
 * Each one is a case where Java's attribute supplier publishes a number that
 * Java Edition itself never runs with, because the class overwrites it at
 * spawn or expresses the behavior in code instead.
 */
export const JAVA_STAT_EXCEPTIONS: readonly JavaStatException[] = [
    ...(
        ['minecraft:horse', 'minecraft:donkey', 'minecraft:mule', 'minecraft:llama', 'minecraft:trader_llama'] as const
    ).map(
        (identifier) =>
            ({
                identifier,
                stat: 'max_health',
                reason: "Java's horse supplier publishes 53 and randomizes the attribute at spawn to a draw from 15 to 30, which is the range Bedrock's health component already writes."
            }) satisfies JavaStatException
    ),
    ...(['minecraft:slime', 'minecraft:magma_cube', 'minecraft:sulfur_cube'] as const).map(
        (identifier) =>
            ({
                identifier,
                stat: 'max_health',
                reason: "Java sets a cube's max health from its size at spawn, so the dumped 20 is the living-entity default. Bedrock writes the same per-size values as component groups."
            }) satisfies JavaStatException
    ),
    ...(['minecraft:slime', 'minecraft:magma_cube'] as const).map(
        (identifier) =>
            ({
                identifier,
                stat: 'attack_damage',
                reason: "Java sets a cube's attack damage from its size at spawn, the same way it sets the health."
            }) satisfies JavaStatException
    ),
    ...(['minecraft:hoglin', 'minecraft:zoglin'] as const).map(
        (identifier) =>
            ({
                identifier,
                stat: 'attack_damage',
                reason: "Bedrock writes the adult damage as a range whose mean is Java's number and the baby's as a separate component group, where Java halves the one attribute in code. Overriding the type would give a baby the adult's damage."
            }) satisfies JavaStatException
    ),
    {
        identifier: 'minecraft:iron_golem',
        stat: 'attack_damage',
        reason: 'Bedrock writes the rolled range 7 to 21. Java rolls the same range from a base of 15, so the two editions agree and only the published number differs.'
    },
    ...(['minecraft:ender_dragon', 'minecraft:armor_stand'] as const).map(
        (identifier) =>
            ({
                identifier,
                stat: 'knockback_resistance',
                reason: "Java makes both immune to knockback in code and leaves the attribute at 0. Taking that 0 would make them knockbackable, which is neither edition's behavior."
            }) satisfies JavaStatException
    )
];

const exceptionKeys = new Set(JAVA_STAT_EXCEPTIONS.map((row) => `${row.identifier}\u0000${row.stat}`));

/** Whether a reviewed row keeps Bedrock's value for a stat Java otherwise decides. */
export const isJavaStatException = (identifier: string, stat: SharedStat): boolean =>
    exceptionKeys.has(`${identifier}\u0000${stat}`);

/** What the decision says about one entity's value for one shared stat. */
export interface StatRuling {
    /**
     * `java` when the server replaces the pack's value with Java's, `bedrock`
     * when the stat is one Bedrock decides, and `exception` when a reviewed row
     * keeps Bedrock's value inside a stat Java otherwise decides.
     */
    readonly kind: 'bedrock' | 'exception' | 'java';
    /** Why, taken from {@link SHARED_STATS} or from the matching {@link JAVA_STAT_EXCEPTIONS} row. */
    readonly reason: string;
}

/**
 * How one entity's value for one shared stat resolves.
 *
 * A caller that has measured a disagreement between the two editions turns it
 * into a reviewed row with this, rather than keeping a second copy of the
 * decision. A `bedrock` or `exception` ruling is an accepted divergence with
 * its reason; a `java` ruling means the resolved value should already be
 * Java's, so a disagreement that still reports one is a defect.
 *
 * @param identifier - The Bedrock entity identifier, such as `minecraft:wither`.
 */
export const statRuling = (identifier: string, stat: SharedStat): StatRuling => {
    const authority = SHARED_STATS[stat];
    if (authority.decidedBy === 'bedrock') return { kind: 'bedrock', reason: authority.reason };

    const exception = JAVA_STAT_EXCEPTIONS.find((row) => row.identifier === identifier && row.stat === stat);
    if (exception !== undefined) return { kind: 'exception', reason: exception.reason };

    return { kind: 'java', reason: authority.reason };
};

/** One Java entity type's hitbox and the attributes its class declares. */
export interface JavaEntityStats {
    /** The hitbox width in blocks. */
    readonly width: number;
    /** The hitbox height in blocks. */
    readonly height: number;
    /** Java attribute id to its base value, such as `minecraft:max_health`. */
    readonly attributes: Readonly<Record<string, number>>;
}

/**
 * Java's entity stats by identifier.
 *
 * `@jsprismarine/bedrock-data` exports the vanilla table as
 * `java_entity_attributes`. This package takes it as data so that the entity
 * runtime does not depend on the goldens, and so a test can pass a table of
 * its own.
 */
export type JavaStatSource = Readonly<Record<string, JavaEntityStats>>;

/**
 * A Java stat table re-keyed by the Bedrock identifier each row's entity
 * spawns under, for the rows whose two editions spell the name differently.
 *
 * Five of the 93 types in Java's dump are a Bedrock entity that kept its
 * legacy identifier: `minecraft:evoker` spawns as `minecraft:evocation_illager`,
 * and `villager`, `zombie_villager`, `tropical_fish` and `zombified_piglin`
 * spawn as `villager_v2`, `zombie_villager_v2`, `tropicalfish` and
 * `zombie_pigman`. Looking those up by the name they spawned under finds
 * nothing, so the decision never reached them and they kept the pack's number.
 *
 * The renames come from `@jsprismarine/mapping`, which owns the Java to Bedrock
 * identifier seam, rather than from a second list here. A Bedrock identifier
 * that several Java types map onto, such as the one every boat variant lands
 * on, is left out: the two editions have no one row to compare, and guessing
 * which Java type's stats to take would be worse than leaving the pack's.
 */
const bedrockKeyedSources = new WeakMap<JavaStatSource, ReadonlyMap<string, JavaEntityStats>>();

/** Builds a source's Bedrock-keyed view on first use and keeps it. */
const bedrockKeyed = (source: JavaStatSource): ReadonlyMap<string, JavaEntityStats> => {
    const cached = bedrockKeyedSources.get(source);
    if (cached !== undefined) return cached;

    const byBedrock = new Map<string, JavaEntityStats>();
    const ambiguous = new Set<string>();
    for (const [javaIdentifier, stats] of Object.entries(source)) {
        const mapped = javaEntityTypeToBedrock(javaIdentifier);
        if (mapped.kind !== 'mapped' || mapped.bedrock === javaIdentifier) continue;
        if (ambiguous.has(mapped.bedrock)) continue;
        if (byBedrock.has(mapped.bedrock)) {
            byBedrock.delete(mapped.bedrock);
            ambiguous.add(mapped.bedrock);
            continue;
        }
        byBedrock.set(mapped.bedrock, stats);
    }

    bedrockKeyedSources.set(source, byBedrock);
    return byBedrock;
};

/**
 * Java's stats for the entity a Bedrock identifier spawns, by that identifier.
 *
 * Most of the dump is keyed by a name both editions spell the same way, so the
 * direct read answers first and the rename index is only consulted for the rest.
 */
export const javaEntityStats = (identifier: string, source: JavaStatSource | undefined): JavaEntityStats | undefined =>
    source === undefined ? undefined : (source[identifier] ?? bedrockKeyed(source).get(identifier));

/** The stats Java decides, in the order {@link SHARED_STATS} declares them. */
const javaDecided = Object.entries(SHARED_STATS).filter(
    (entry): entry is [SharedStat, StatAuthority & { attribute: AttributeName; javaAttribute: string }] =>
        entry[1].decidedBy === 'java' && entry[1].attribute !== undefined && entry[1].javaAttribute !== undefined
);

/**
 * The attribute base values Java Edition decides for one entity type.
 *
 * A component that declares one of these attributes gets Java's number instead
 * of the one the Bedrock pack wrote, with the reviewed exceptions left alone.
 * Attributes Java does not publish for the type are absent, so the pack's value
 * stands.
 *
 * The identifier is the one the entity spawns under, which for five types is
 * Bedrock's legacy spelling rather than Java's, so the row is found through
 * {@link javaEntityStats} rather than by a direct read.
 *
 * @param identifier - The Bedrock entity identifier, such as `minecraft:wither`.
 * @param source - Java's stat table, or undefined to run on the pack's values alone.
 * @returns Attribute name to the base value, empty when nothing is overridden.
 */
export const javaAttributeBases = (
    identifier: string,
    source: JavaStatSource | undefined
): ReadonlyMap<AttributeName, number> => {
    const bases = new Map<AttributeName, number>();
    const stats = javaEntityStats(identifier, source);
    if (stats === undefined) return bases;

    for (const [stat, authority] of javaDecided) {
        if (isJavaStatException(identifier, stat)) continue;
        const value = stats.attributes[authority.javaAttribute];
        if (value !== undefined) bases.set(authority.attribute, value);
    }

    return bases;
};
