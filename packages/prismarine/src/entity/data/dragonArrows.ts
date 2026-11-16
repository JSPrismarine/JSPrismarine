/**
 * Arrows against a perched ender dragon, after Java 26.3's `AbstractDragonSittingPhase.onHurt` and
 * `AbstractArrow.onHitEntity`.
 *
 * While the dragon sits on the exit portal, an arrow that hits it is set on fire for a second and
 * deals nothing. The hurt that came to nothing turns the arrow back: Java's `ProjectileDeflection.
 * REVERSE` halves its speed and points it the other way, and the arrow then keeps a fifth of
 * that, so it falls away from the dragon at a tenth of the speed it came in at.
 */
import { dragonPhaseState, isSittingPhase } from '@jsprismarine/entity-goals/goals/dragonPhases';
import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';

import type { DataEntity } from './DataEntity';

/** Java's `AbstractArrow` types, as Bedrock names the ones it has. */
const ARROWS: ReadonlySet<string> = new Set(
    ['minecraft:arrow', 'minecraft:spectral_arrow', 'minecraft:trident'].flatMap((javaId) => {
        const mapped = javaEntityTypeToBedrock(javaId);
        return mapped.kind === 'mapped' ? [mapped.bedrock] : [];
    })
);

/** How long the arrow burns, Java's `igniteForSeconds(1.0F)`. */
export const DEFLECTED_ARROW_FIRE_TICKS = 20;

/** What the arrow keeps of its velocity, Java's `scale(-0.5)` then `scale(0.2)`. */
export const DEFLECTED_ARROW_SPEED = -0.1;

/** Whether an arrow that hits this entity comes off a perched dragon, harmless and burning. */
export const deflectsArrow = (target: DataEntity, projectile: string): boolean => {
    if (!ARROWS.has(projectile)) return false;
    const phase = target.instance.componentState.get(dragonPhaseState)?.phase;
    return phase !== undefined && isSittingPhase(phase);
};
