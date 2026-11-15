import { isRecord } from '@jsprismarine/entities';

/** The component reads {@link fallsUnderGravity} needs from an entity. */
export interface GravityComponents {
    hasComponent(name: string): boolean;
    componentParams(name: string): unknown;
}

/**
 * Whether gravity pulls an entity down while nothing holds it up.
 *
 * `minecraft:physics` turns gravity on by default, and a ghast, a bat, a bee and the wither all
 * declare it bare. What keeps them in the air is `minecraft:can_fly`: Java runs them as flying
 * mobs whose travel applies no gravity (`FlyingMob`, the bat's own `aiStep`, and a
 * `FlyingMoveControl` that hovers in place). The parrot is the exception both editions share: its
 * `minecraft:movement.fly`, Java's `FlyingMoveControl` without hovering, lets it flutter down
 * whenever it stops flying.
 * @param entity - The entity's active components.
 * @returns Whether the entity falls.
 */
export const fallsUnderGravity = (entity: GravityComponents): boolean => {
    const physics = entity.componentParams('minecraft:physics');
    if (!isRecord(physics) || physics.hasGravity !== true) return false;
    return !entity.hasComponent('minecraft:can_fly') || entity.hasComponent('minecraft:movement.fly');
};
