import { Gametype } from '@jsprismarine/minecraft';

import { BOW } from '../../entity/Archery';
import { Item } from '../../item/Item';
import { consumeTicksOf, useItemInAir } from '../../item/interaction';
import type { InteractionResult } from '../../item/interaction';
import { HELD_USE_TICKS, startItemUse } from '../../item/itemUse';
import type { InputContext } from '../../player/context/HandlerContext';
import type PlayerSession from '../../player/PlayerSession';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';
import { ENDER_EYE, enderEyeEcho } from './eyeOfEnderEcho';

/**
 * One right click on nothing, offered to the item in hand.
 *
 * @returns Whether a behavior consumed the click. A behavior that throws is logged and declines.
 */
const contentUseInAir = ({ services, log }: InputContext, player: PlayerSession): InteractionResult => {
    const { content } = services;
    const actors = services.contentWorld.actorsAt(
        player.getWorld().getDimension().name,
        player.getWorld().getLevel().name
    );

    try {
        return useItemInAir({ content, actors, player });
    } catch (error: unknown) {
        log.error(error);
        return 'declined';
    }
};

/**
 * Starts the clock on eating or drinking the item in hand, if it is a consumable.
 *
 * The client reports the start of a meal and nothing at its end, so the player finishes it
 * itself once the item's `consume_seconds` have passed.
 */
const startMeal = ({ services, step }: InputContext, session: PlayerSession): void => {
    const player = session.getPlayer();
    const ticks = consumeTicksOf(services.content, player);
    if (ticks === undefined) return;

    if (session.inputs().beginPlayerMeal(player, ticks))
        startItemUse(session, player.getInventory().equipment('mainhand') ?? Item.air(), ticks, step.tick);
};

/**
 * The player used the item in hand at nothing: a bow starts its draw, a meal begins, and the
 * item's own `onUse` runs, which is how an eye of ender or a snowball leaves the hand.
 */
export default class UseItemHandler implements IntentHandler<'useItem'> {
    public static readonly Kind = 'useItem';

    /** Runs the use for anyone but a spectator, who touches nothing. */
    public handle({ held }: Intent<'useItem'>, context: InputContext): undefined {
        const { session, step } = context;
        const player = session.getPlayer();
        if (player.gamemode === Gametype.SPECTATOR) return;
        const inHand = player.getInventory().equipment('mainhand');

        // A held button is not a new eye of ender click, and neither is the air-use report of a
        // click that was just used on a block. After the frame takes an eye, neither may throw it.
        if (inHand?.getName() === ENDER_EYE && (held || enderEyeEcho.isEcho(session.runtimeId, step.tick))) return;

        // Neither edition says how long a bow was drawn for. A client says the draw started here
        // and let go in `releaseItem`, and the gap between the two is the charge, so the clock
        // starts here, on the click. A Bedrock client reports the button held each tick of the
        // draw, and restarting the clock on those would leave the arrow a tick's charge.
        if (inHand?.getName() === BOW && !held) {
            player.beginItemUse(step.tick);
            startItemUse(session, inHand, HELD_USE_TICKS, step.tick);
        }

        if (contentUseInAir(context, session) === 'handled') startMeal(context, session);
    }
}
