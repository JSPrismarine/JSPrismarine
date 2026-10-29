import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type ShowCreditsPacket from '../packet/ShowCreditsPacket';
import { CreditsState } from '../packet/ShowCreditsPacket';
import type PacketHandler from './PacketHandler';

/**
 * The client reporting that the end credits have finished.
 *
 * The report is recorded at debug level and dropped. Known gap: the server never starts the
 * credits, because leaving the End through the exit portal is not modeled, so there is no
 * player to put back in the world when they end.
 */
export default class ShowCreditsHandler implements PacketHandler<ShowCreditsPacket> {
    public static PacketName = 'ShowCreditsPacket';

    /** Logs the credits state the client reported. */
    public handle(packet: ShowCreditsPacket, server: Server, session: PlayerSession): void {
        const state = packet.creditsState === CreditsState.Finished ? 'finished' : 'started';

        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} reported the end credits ${state}. The server never starts them`,
                'ShowCreditsHandler/handle'
            );
    }
}
