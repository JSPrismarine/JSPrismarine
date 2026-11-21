import { EmoteFlags } from '@jsprismarine/protocol/bedrock/packet/EmotePacket';

import PlayerEmoteEvent from '../../events/player/PlayerEmoteEvent';
import type { InputContext } from '../../network/handler/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/**
 * The player played an emote.
 *
 * The emote is relayed as a fresh packet encoded by the server, carrying the sender's own XUID
 * and the `ServerSide` flag the docs require on the copy the server sends, so a client cannot
 * sign the emote with somebody else's account. The server does not check that the sender owns
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
            flags: flags | EmoteFlags.ServerSide
        });

        services.events.post('playerEmote', new PlayerEmoteEvent(session, emote));

        log.debug(`${session.identity.name} played emote ${emote} for ${lengthTicks} ticks`);
    }
}
