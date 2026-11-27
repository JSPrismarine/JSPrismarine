/**
 * Blows against a perched ender dragon, after Java 26.3's `EnderDragon.knockback`,
 * `AbstractDragonSittingPhase.onHurt` and `AbstractArrow.onHitEntity`.
 *
 * While the dragon sits, no blow knocks it back. In flight it takes knockback as any mob does.
 *
 * While the dragon sits on the exit portal, an arrow that hits it is set on fire for a second and
 * deals nothing. The hurt that came to nothing turns the arrow back: Java's `ProjectileDeflection.
 * REVERSE` halves its speed and points it the other way, and the arrow then keeps a fifth of
 * that, so it falls away from the dragon at a tenth of the speed it came in at.
 */
import { dragonPhaseState, isSittingDragonPhase } from '@jsprismarine/entity-goals/goals/dragonPhases';

import { isArrow } from './arrows';
import type { DataEntity } from './DataEntity';

/** How long the arrow burns, Java's `igniteForSeconds(1.0F)`. */
export const DEFLECTED_ARROW_FIRE_TICKS = 20;

/** What the arrow keeps of its velocity, Java's `scale(-0.5)` then `scale(0.2)`. */
export const DEFLECTED_ARROW_SPEED = -0.1;

/**
 * Whether a dragon sits in one of its perched phases, Java's `DragonPhaseInstance.isSitting`.
 *
 * @javaSee DragonPhaseInstance.isSitting
 */
const isPerchedDragon = (target: DataEntity): boolean => {
    const phase = target.instance.componentState.get(dragonPhaseState)?.phase;
    return phase !== undefined && isSittingDragonPhase(phase);
};

/**
 * Whether a blow's knockback passes this entity by, as Java's `EnderDragon.knockback` returns
 * before `LivingEntity.knockback` while a sitting phase runs.
 *
 * @javaSource EnderDragon.knockback
 */
export const ignoresKnockback = (target: DataEntity): boolean => isPerchedDragon(target);

/** Whether an arrow that hits this entity comes off a perched dragon, harmless and burning. */
export const deflectsArrow = (target: DataEntity, projectile: string): boolean => {
    return isArrow(projectile) && isPerchedDragon(target);
};
