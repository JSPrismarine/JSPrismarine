/**
 * What a data-driven mob's death hands Java's loot tables: the mob's own state and the blow that
 * killed it.
 *
 * Java's `LivingEntity.dropFromLootTable` rolls the type's `entities/<id>` table with the mob as
 * `this_entity`, the killing blow as `damage_source`, its source as `attacking_entity`, and the
 * last player to hurt the mob as `last_damage_player`. A table reads all four: a blaze drops its
 * rods only for a player's kill, a sheep's wool is its own color, a slime drops slime balls only
 * at the smallest size, and a creeper a skeleton shot drops a music disc. A roll without them takes
 * the other branch of every one of those, which is what the runtime's death did before.
 */
import type { DamageSource as PredicateDamageSource, EntityView } from '@jsprismarine/predicates';

import type { ServerContent } from '../../content/ServerContent';
import { bedrockEntityTypeTagsFor } from '../../content/entityTypeTags';
import type { ContentPosition } from '../../content/world/adapter';
import { damageTagsOf } from '../mobLoot';
import type { MobLootState } from '../mobLoot';
import type { DataEntity } from './DataEntity';
import type { DamageRecord } from './damageLog';

/** The dye names in the order Bedrock's `minecraft:color` index counts them, which Java's sheep tables key on. */
const DYE_COLORS = [
    'white',
    'orange',
    'magenta',
    'light_blue',
    'yellow',
    'lime',
    'pink',
    'gray',
    'light_gray',
    'cyan',
    'purple',
    'blue',
    'brown',
    'green',
    'red',
    'black'
] as const;

/** The mobs whose `minecraft:variant` is the cube size Java's `type_specific/cube_mob` predicate reads. */
const CUBE_MOBS: ReadonlySet<string> = new Set(['minecraft:slime', 'minecraft:magma_cube']);

/**
 * The state of a dying mob that Java's entity predicates read: whether it burned or was a baby,
 * a sheep's color and whether it was sheared, and a slime's size.
 *
 * @param entity - The mob that died.
 * @returns The state, which `rollMobDrops` puts beside the mob's Java type.
 */
export const deathLootState = (entity: DataEntity): MobLootState => {
    const instance = entity.instance;
    const color = entity.body.color;
    const variant = instance.componentParams('minecraft:variant');
    const colorName = color === undefined ? undefined : DYE_COLORS[color];
    return {
        flags: { is_on_fire: entity.body.fireTicks > 0, is_baby: instance.hasComponent('minecraft:is_baby') },
        // An empty record rather than none: the predicates read an absent one as a host that cannot say.
        equipment: {},
        components: new Map(
            entity.identifier === 'minecraft:sheep' && colorName !== undefined
                ? [['minecraft:sheep/color', colorName]]
                : []
        ),
        typeSpecific: {
            sheared: instance.hasComponent('minecraft:is_sheared'),
            ...(CUBE_MOBS.has(entity.identifier) && typeof variant === 'number' ? { size: variant } : {})
        }
    };
};

/** The entity behind a blow, as the predicates read it, or undefined when it has gone. */
export type DeathKiller = (sourceId: number) => EntityView | undefined;

/** The Java damage type of a runtime damage cause, for the causes a death table tells apart. */
const damageTypeOf = (cause: string, byPlayer: boolean, hasSource: boolean): string => {
    switch (cause) {
        case 'entity_attack':
            return byPlayer ? 'minecraft:player_attack' : 'minecraft:mob_attack';
        case 'projectile':
            return byPlayer ? 'minecraft:arrow' : 'minecraft:mob_projectile';
        case 'entity_explosion':
        case 'block_explosion':
            return byPlayer ? 'minecraft:player_explosion' : 'minecraft:explosion';
        case 'fire':
            return 'minecraft:in_fire';
        case 'fire_tick':
            return 'minecraft:on_fire';
        case 'lava':
            return 'minecraft:lava';
        case 'fall':
            return 'minecraft:fall';
        case 'drowning':
            return 'minecraft:drown';
        case 'lightning':
            return 'minecraft:lightning_bolt';
        case 'void':
            return 'minecraft:out_of_world';
        default:
            return hasSource ? 'minecraft:mob_attack' : 'minecraft:generic';
    }
};

/**
 * The killing blow as the `damage_source` parameter reads it.
 *
 * @param content - The content build, for the damage type's tags.
 * @param record - The blow the mob's damage log holds last, which is the one that killed it.
 * @param killerOf - Resolves the blow's source to the entity behind it.
 * @returns The source, or undefined when nothing is on record.
 */
export const deathDamageSource = (
    content: ServerContent,
    record: DamageRecord | undefined,
    killerOf: DeathKiller
): PredicateDamageSource | undefined => {
    if (record === undefined) return undefined;
    const killer = record.sourceId === undefined ? undefined : killerOf(record.sourceId);
    const type = damageTypeOf(record.cause, killer?.type === 'minecraft:player', killer !== undefined);
    return {
        type,
        tags: damageTagsOf(content, type),
        ...(killer === undefined ? {} : { sourceEntity: killer, directEntity: killer, position: killer.position })
    };
};

/**
 * A runtime entity as the predicates read a killer: its Bedrock type, its type tags and where it
 * stood, with an empty hand.
 */
export const killerView = (content: ServerContent, identifier: string, position: ContentPosition): EntityView => ({
    type: identifier,
    typeTags: bedrockEntityTypeTagsFor(content.tags, identifier),
    position: { x: position.x, y: position.y, z: position.z },
    equipment: {}
});
