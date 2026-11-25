import type { InputContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/** The player started or stopped sneaking. */
export default class SetSneakingHandler implements IntentHandler<'setSneaking'> {
    public static readonly Kind = 'setSneaking';

    /** Sets the sneak on the player, which replication shows the players that see it. */
    public handle({ sneaking }: Intent<'setSneaking'>, { session }: InputContext): undefined {
        session.inputs().setPlayerSneaking(session.getPlayer(), sneaking);
    }
}
