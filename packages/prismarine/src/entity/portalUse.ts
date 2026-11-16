/**
 * Which entities a portal moves, by Java 26.3's `Entity.canUsePortal`.
 *
 * Java lets every entity through a portal but the ones whose class says no: the ender dragon
 * (`EnderDragon.canUsePortal`), a fishing hook (`FishingHook.canUsePortal`) and a creaking bound
 * to its creaking heart (`Creaking.canUsePortal`, `isHeartBound`). Bedrock's
 * `minecraft:dimension_bound` names more, arrows and fireballs among them, which Java's portals
 * carry, so the component decides only the creaking, whose heart-bound group is the one that
 * declares it.
 */

/** The vanilla types Java's portals never move. */
const NEVER_THROUGH_PORTALS: ReadonlySet<string> = new Set(['minecraft:ender_dragon', 'minecraft:fishing_hook']);

/** The type whose portal use depends on whether a creaking heart binds it. */
const CREAKING = 'minecraft:creaking';

/**
 * Whether a portal may move an entity of this type.
 * @param identifier - The entity's Bedrock identifier.
 * @param declares - Whether the entity's active definition declares a component.
 */
export const canUsePortal = (identifier: string, declares: (component: string) => boolean): boolean => {
    if (NEVER_THROUGH_PORTALS.has(identifier)) return false;
    if (identifier === CREAKING) return !declares('minecraft:dimension_bound');
    return true;
};
