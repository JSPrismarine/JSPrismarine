/**
 * One live entity as the Java predicate grammar reads one.
 *
 * `EntityView` is the seam `@jsprismarine/predicates` leaves for the host, and
 * three subsystems reach for it now rather than one: the loot tables, the
 * enchantment effect components, and the 58 advancement triggers. Each used to
 * build its own, which meant an advancement condition could see a player's
 * equipment while an enchantment condition could not.
 *
 * Every member is optional in the interface and that is load-bearing: a member
 * left out reports a diagnostic and evaluates false, while a member filled in
 * with a guess quietly answers wrong. So this fills in what a live entity can
 * actually say and leaves the rest out. Absent on purpose:
 *
 * - **`effects`.** There is no status effect system yet, which is also why
 *   `Entity.getResistanceLevel` is a constant zero.
 * - **`scores`, `team`, `nbt`, `vehicle`, `passenger`, `target`, `lookingAt`.**
 *   Nothing on a `World` answers any of them.
 */
import type { EntityView, EquipmentSlot, ItemStack as PredicateItemStack, Vec3 } from '@jsprismarine/predicates';

import type { ContentTags } from '../content/tags';
import { bedrockEntityTypeTagsFor } from '../content/entityTypeTags';
import type { Item } from '../item/Item';

/** The little of an entity a view needs, so a test satisfies it without a world. */
export interface ViewableEntity {
    getType(): string;
    getPosition(): { getX(): number; getY(): number; getZ(): number };
    isOnFire?(): boolean;
    isOnGround?(): boolean;
}

/** What a human adds: the four worn slots, the hand and the off hand. */
export interface ViewableEquipment {
    mainhand?: Item;
    offhand?: Item;
    head?: Item;
    chest?: Item;
    legs?: Item;
    feet?: Item;
}

/** What a player adds on top of a human: the bars only a player has. */
export interface ViewablePlayerState {
    readonly experienceLevel?: number;
    readonly gameMode?: string;
    readonly food?: { readonly level: number; readonly saturation: number };
    readonly sneaking?: boolean;
    readonly sprinting?: boolean;
    readonly flying?: boolean;
}

/** Anything the caller knows about the entity that the entity itself does not expose. */
export interface EntityViewOptions {
    readonly equipment?: ViewableEquipment;
    readonly player?: ViewablePlayerState;
    /** The merged Java entity type tags, mapped to this server's identifiers. */
    readonly tags?: ContentTags;
}

/** The equipment slots a stack can be worn in, in the order a view lists them. */
const EQUIPMENT_ORDER = [
    'mainhand',
    'offhand',
    'head',
    'chest',
    'legs',
    'feet'
] as const satisfies readonly EquipmentSlot[];

/** The position as the predicates read one: three plain numbers. */
export const vec3Of = (position: { getX(): number; getY(): number; getZ(): number }): Vec3 => ({
    x: position.getX(),
    y: position.getY(),
    z: position.getZ()
});

/**
 * The equipment map, with an empty map rather than an absent one when the
 * entity wears nothing.
 *
 * The difference matters: an absent `equipment` reads as "this host cannot
 * say" and reports, while an empty one reads as "wearing nothing", which is
 * what a naked player is.
 */
const equipmentOf = (
    equipment: ViewableEquipment | undefined
): Readonly<Partial<Record<EquipmentSlot, PredicateItemStack>>> => {
    const slots: Partial<Record<EquipmentSlot, PredicateItemStack>> = {};
    if (!equipment) return slots;

    for (const slot of EQUIPMENT_ORDER) {
        const held = equipment[slot];
        if (held && held.getName() !== 'minecraft:air') slots[slot] = held.asPredicateStack();
    }
    return slots;
};

/**
 * Builds the view for one entity.
 *
 * @param entity - The live entity.
 * @param options - What the caller knows that the entity does not expose:
 *   its equipment, Java tags, and the player bars when it is a player.
 */
export const entityPredicateView = (entity: ViewableEntity, options: EntityViewOptions = {}): EntityView => {
    const { player, tags } = options;
    const typeTags = tags === undefined ? undefined : bedrockEntityTypeTagsFor(tags, entity.getType());

    return {
        type: entity.getType(),
        ...(typeTags === undefined ? {} : { typeTags }),
        position: vec3Of(entity.getPosition()),
        equipment: equipmentOf(options.equipment),
        flags: {
            ...(entity.isOnFire === undefined ? {} : { is_on_fire: entity.isOnFire() }),
            ...(entity.isOnGround === undefined ? {} : { is_on_ground: entity.isOnGround() }),
            ...(player?.sneaking === undefined ? {} : { is_sneaking: player.sneaking }),
            ...(player?.sprinting === undefined ? {} : { is_sprinting: player.sprinting }),
            ...(player?.flying === undefined ? {} : { is_flying: player.flying })
        },
        ...(player?.experienceLevel === undefined ? {} : { experienceLevel: player.experienceLevel }),
        ...(player?.gameMode === undefined ? {} : { gameMode: player.gameMode }),
        ...(player?.food === undefined ? {} : { food: player.food })
    };
};
