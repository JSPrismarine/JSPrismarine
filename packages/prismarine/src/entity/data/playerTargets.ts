import type { ContentEntity, ContentLevelFacts } from '../../content/world/adapter';

/**
 * Whether a mob may take a player as its target: Java's `LivingEntity.canAttack`, which refuses
 * every player while the world is on peaceful, with the creative and spectator players Java's
 * `TargetingConditions` passes over.
 *
 * Peaceful is why this is one rule rather than a mode check at each caller: a wolf, a bee or an
 * alerted piglin that a player hits on peaceful does not turn on them, and every path a mob takes
 * a player as its target has to say so.
 *
 * @param player - The player, or undefined when the host no longer knows them.
 * @param level - The world the mob is in, which says what the difficulty is.
 * @javaSource LivingEntity.canAttack
 */
export const canTargetPlayer = (
    player: ContentEntity | undefined,
    level: Pick<ContentLevelFacts, 'difficulty'>
): boolean =>
    player !== undefined && player.creative !== true && player.spectator !== true && level.difficulty() !== 'peaceful';
