import { Gametype } from '@jsprismarine/minecraft';

import { CREATIVE_REACH, meleeAttack, SURVIVAL_REACH } from '../../entity/Combat';
import { EXHAUSTION } from '../../entity/playerHunger';
import PlayerAttackEntityEvent from '../../events/player/PlayerAttackEntityEvent';
import { Item } from '../../item/Item';
import type { InputContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/**
 * What sprinting is worth in knockback levels.
 *
 * One, the same as a level of the Knockback enchantment, which is why a sprint-hit sends
 * somebody flying and a standing one nudges them.
 */
const SPRINT_KNOCKBACK = 1;

/**
 * The player hit an actor with the item in hand.
 *
 * The target is looked up by runtime id in the world's own map. A runtime id the world does not
 * track is ordinary traffic, since a client can swing at something the server removed in the
 * same tick, and it is logged at verbose level and dropped. The reach is measured by
 * `meleeAttack` from the server's position for the player, not from anything the client sent.
 */
export default class AttackEntityHandler implements IntentHandler<'attackEntity'> {
    public static readonly Kind = 'attackEntity';

    /** Posts `playerAttackEntity` and, unless a plugin cancels it, swings. */
    public handle({ target: runtimeId }: Intent<'attackEntity'>, { session, services, log }: InputContext): undefined {
        const player = session.getPlayer();
        if (player.gamemode === Gametype.SPECTATOR) return;

        const target = session.getWorld().getActor(runtimeId);
        if (target === null) {
            log.verbose(`${session.identity.name} swung at runtime id ${runtimeId}, which is not an entity here`);
            return;
        }

        // A player whose entity is in no store yet cannot reach anything.
        const attacker = session.getActor();
        if (attacker === undefined) return;
        const components = player.getComponents();
        const held = player.getInventory().equipment('mainhand');
        const swing = new PlayerAttackEntityEvent(attacker, target, held);
        services.events.post('playerAttackEntity', swing);
        if (swing.isCanceled()) return;
        // In this input's unit: the blow, its sounds and the hunger it costs are all written
        // before `meleeAttack` returns, so a throw anywhere undoes the swing whole.
        const landed = meleeAttack(attacker, target, {
            reach: player.gamemode === Gametype.CREATIVE ? CREATIVE_REACH : SURVIVAL_REACH,

            // What they are holding, not their attack attribute: in vanilla the weapon *is*
            // the number, and an empty hand is one point rather than none.
            damage: (held ?? Item.air()).getAttackDamage(),

            // Falling, and actually descending: a player on the way up through a jump is off
            // the ground too, and vanilla does not let them crit from there.
            critical: !player.isOnGround() && components.get('vitals.fallDistance') > 0 && !player.isFlying(),

            knockbackLevels: components.get('movement.sprinting') ? SPRINT_KNOCKBACK : 0
        });

        // Only a swing that connected costs anything. A miss is free, which is why the hunger
        // is charged here rather than before the attempt.
        if (landed) session.inputs().exhaustPlayer(player, EXHAUSTION.attacking);
    }
}
