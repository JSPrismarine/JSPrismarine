import PlayerEmoteEvent from '../../events/player/PlayerEmoteEvent';
import type { InputContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/**
 * The player played an emote.
 *
 * The emote is relayed under the sender's own XUID, from the server's record, so a client cannot
 * sign the emote with somebody else's account. The flags are the client's; the encoder adds what
 * its edition requires on the server's copy. The server does not check that the sender owns
 * the emote. The relay reaches the sender's own world, and only the clients that have them on
 * screen, which replication works out when the tick seals.
 */
export default class EmoteHandler implements IntentHandler<'emote'> {
    public static readonly Kind = 'emote';

    /** Relays the emote to the players that have the sender on screen and logs it at debug level. */
    public handle(
        { emote, lengthTicks, platformId, flags }: Intent<'emote'>,
        { session, log, services }: InputContext
    ): undefined {
        session.getWorld().relayEmote({
            entity: session.runtimeId,
            emote,
            lengthTicks,
            // The server's record of who this is, not the client's.
            xuid: session.identity.xuid,
            platformId,
            flags
        });

        services.events.post('playerEmote', new PlayerEmoteEvent(session, emote));

        log.debug(`${session.identity.name} played emote ${emote} for ${lengthTicks} ticks`);
    }
}
