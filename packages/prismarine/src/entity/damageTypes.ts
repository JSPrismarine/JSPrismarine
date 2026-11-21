import type { Vector3 } from '@jsprismarine/math';

import type { ServerContent } from '../content/ServerContent';
import { DamageCause } from './DamageCause';
import { DamageSource } from './DamageSource';
import type { StoreActor } from './data/storeActors';
import { damageTagsOf } from './mobLoot';
import { isRecord } from '../utils/isRecord';

/**
 * Java damage types, as `/damage` and datapacks name them, mapped onto the causes this server
 * models.
 *
 * A damage type is data: a datapack declares it under `damage_type/` and sorts it into the
 * `damage_type` tags (`bypasses_armor`, `is_fire`, `is_fall` and the rest). Both come from the
 * content build, so the answer follows the loaded packs. What is left to code is the part the
 * data does not say, which cause of this server's enum a type stands for.
 */

/** The categories the vanilla tags give, first match winning. */
const CAUSE_BY_TAG: ReadonlyArray<readonly [string, DamageCause]> = [
    ['minecraft:is_drowning', DamageCause.Drowning],
    ['minecraft:is_fall', DamageCause.Fall],
    ['minecraft:is_explosion', DamageCause.Explosion],
    ['minecraft:is_projectile', DamageCause.Projectile],
    ['minecraft:is_fire', DamageCause.Fire]
];

/** The vanilla types no category tag covers, by what the server does with each. */
const CAUSE_BY_TYPE: Readonly<Record<string, DamageCause>> = {
    'minecraft:lava': DamageCause.Lava,
    'minecraft:generic_kill': DamageCause.SelfDestruct,
    'minecraft:out_of_world': DamageCause.Void,
    'minecraft:starve': DamageCause.Starvation,
    'minecraft:wither': DamageCause.Wither,
    'minecraft:magic': DamageCause.Magic,
    'minecraft:indirect_magic': DamageCause.Magic,
    'minecraft:dragon_breath': DamageCause.Magic,
    'minecraft:sonic_boom': DamageCause.SonicBoom,
    'minecraft:thorns': DamageCause.Thorns,
    'minecraft:in_wall': DamageCause.Suffocation,
    'minecraft:cramming': DamageCause.Suffocation,
    'minecraft:cactus': DamageCause.Contact,
    'minecraft:sweet_berry_bush': DamageCause.Contact,
    'minecraft:player_attack': DamageCause.Attack,
    'minecraft:mob_attack': DamageCause.Attack,
    'minecraft:mob_attack_no_aggro': DamageCause.Attack,
    'minecraft:sting': DamageCause.Attack,
    'minecraft:mace_smash': DamageCause.Attack
};

/** The cause of this server's enum a Java damage type stands for; `generic` when it names none. */
export const damageCauseOfType = (type: string, tags: ReadonlySet<string>): DamageCause => {
    const byType = CAUSE_BY_TYPE[type];
    if (byType !== undefined) return byType;

    for (const [tag, cause] of CAUSE_BY_TAG) {
        if (tags.has(tag)) return cause;
    }
    return DamageCause.Generic;
};

/**
 * The causes the types of one `damage_type` tag stand for, such as the magic, sonic boom and
 * thorns of Java's `witch_resistant_to`.
 * @param content - The content build, for its `damage_type` tags.
 * @param tag - The tag, such as `minecraft:witch_resistant_to`.
 */
export const damageCausesInTag = (content: ServerContent, tag: string): ReadonlySet<DamageCause> =>
    new Set(
        content.tags.has('damage_type', tag)
            ? content.tags
                  .members('damage_type', tag)
                  .map((type) => damageCauseOfType(type, new Set(damageTagsOf(content, type))))
            : []
    );

/**
 * The Java damage type a blow stands for when it names none, by the cause name the blow carries:
 * the Bedrock cause or this server's own. A flame a player stands in is Java's `in_fire`, and the
 * burning it leaves (`fire_tick`) is `on_fire`.
 */
const TYPE_BY_CAUSE: Readonly<Record<string, string>> = {
    attack: 'minecraft:mob_attack',
    entity_attack: 'minecraft:mob_attack',
    projectile: 'minecraft:arrow',
    explosion: 'minecraft:explosion',
    entity_explosion: 'minecraft:explosion',
    block_explosion: 'minecraft:explosion',
    fire: 'minecraft:in_fire',
    fire_tick: 'minecraft:on_fire',
    lava: 'minecraft:lava',
    contact: 'minecraft:cactus',
    thorns: 'minecraft:thorns',
    drowning: 'minecraft:drown',
    fall: 'minecraft:fall',
    starvation: 'minecraft:starve',
    starve: 'minecraft:starve',
    void: 'minecraft:out_of_world',
    suffocation: 'minecraft:in_wall',
    magic: 'minecraft:magic',
    wither: 'minecraft:wither',
    sonic_boom: 'minecraft:sonic_boom',
    self_destruct: 'minecraft:generic_kill'
};

/** The declaration of the Java damage type a blow names, or the one its cause stands for. */
const damageTypeData = (content: ServerContent, cause: string, damageType?: string): unknown =>
    content.definitions.damageTypes.get(damageType ?? TYPE_BY_CAUSE[cause] ?? 'minecraft:generic')?.data;

/**
 * The food exhaustion a blow that takes a player's health costs, Java's
 * `DamageSource.getFoodExhaustion`: the `exhaustion` its damage type declares, 0.1 for a blow and
 * 0 for drowning, falling, starving and the other types that are not.
 * @param content - The content build, for the damage type definitions.
 * @param cause - The cause name the blow carries.
 * @param damageType - The Java damage type the blow names, when it names one.
 */
export const foodExhaustionOf = (content: ServerContent, cause: string, damageType?: string): number => {
    const data = damageTypeData(content, cause, damageType);
    return isRecord(data) && typeof data.exhaustion === 'number' ? data.exhaustion : 0;
};

/** How a damage type scales with the difficulty, Java's `DamageScaling`. */
export type DamageScaling = 'never' | 'always' | 'when_caused_by_living_non_player';

/**
 * Whether a blow scales with the difficulty, by the `scaling` its damage type declares: `never`,
 * `always`, or `when_caused_by_living_non_player`, which is every mob attack.
 * @param content - The content build, for the damage type definitions.
 * @param cause - The cause name the blow carries.
 * @param damageType - The Java damage type the blow names, when it names one.
 */
export const damageScalingOf = (content: ServerContent, cause: string, damageType?: string): DamageScaling => {
    const data = damageTypeData(content, cause, damageType);
    const scaling = isRecord(data) ? data.scaling : undefined;
    return scaling === 'always' || scaling === 'when_caused_by_living_non_player' ? scaling : 'never';
};

/** Where `/damage` says a blow came from. */
export interface DamageOrigins {
    /** `by`: what made contact. */
    readonly by?: StoreActor;
    /** `from`: who is answerable for `by`; without it `by` is both. */
    readonly from?: StoreActor;
    /** `at`: a point the blow came from. */
    readonly at?: Vector3;
}

/**
 * Whether the loaded datapacks declare a damage type.
 * @param content - The content build.
 * @param type - A damage type id such as `minecraft:in_fire`.
 */
export const hasDamageType = (content: ServerContent, type: string): boolean =>
    // A stack that loaded no datapack declares no types, and refusing every one of them would leave
    // `/damage` unusable; there is nothing to validate against then, so a type is taken as named.
    content.definitions.damageTypes.size === 0 || content.definitions.damageTypes.has(type);

/**
 * Builds the source for a damage type and the entities behind it, the way Java's `/damage` does.
 *
 * With `by` alone the entity is both who made contact and who is answerable. With `from` as well,
 * `from` is answerable and `by` made contact, so an arrow shot by a skeleton blames the skeleton.
 * With neither there is no source entity at all, whoever ran the command.
 * @param content - The content build, for the type's tags.
 * @param type - A damage type id.
 * @param origins - The optional `by`, `from` and `at` clauses.
 */
export const damageSourceOfType = (content: ServerContent, type: string, origins: DamageOrigins = {}): DamageSource => {
    // With no damage types loaded there are no tags to read, so the fixed per-cause rules apply.
    const tags = content.definitions.damageTypes.size === 0 ? undefined : new Set(damageTagsOf(content, type));
    const answerable = origins.from ?? origins.by ?? null;
    const contact =
        origins.from !== undefined && origins.by !== undefined && origins.by !== origins.from ? origins.by : null;

    return new DamageSource({
        cause: damageCauseOfType(type, tags ?? new Set()),
        attacker: answerable,
        projectile: contact,
        damageType: type,
        ...(tags === undefined ? {} : { tags }),
        position: origins.at ?? null
    });
};
