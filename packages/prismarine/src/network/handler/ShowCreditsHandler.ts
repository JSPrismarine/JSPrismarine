import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type ShowCreditsPacket from '@jsprismarine/protocol/packet/ShowCreditsPacket';
import { CreditsState } from '@jsprismarine/protocol/packet/ShowCreditsPacket';
import type PacketHandler from './PacketHandler';

/**
 * The client reporting that the end credits have finished.
 *
 * The server starts the credits through `PlayerSession.startCredits` when a player first
 * leaves the End, holding the resolved arrival; the `Finished` reply completes that held
 * world change. A finish with no credits pending, or a client-sent `Start`, is logged at
 * debug and dropped.
 */
export default class ShowCreditsHandler implements PacketHandler<ShowCreditsPacket> {
    public static PacketName = 'ShowCreditsPacket';
    public readonly phases = ['play'] as const;

    /** Completes the held world change on `Finished`, and drops anything else. */
    public async handle(packet: ShowCreditsPacket, server: Server, session: PlayerSession): Promise<void> {
        if (packet.creditsState === CreditsState.Finished) {
            if (await session.completeCredits()) return;

            server
                .getLogger()
                .debug(
                    `${session.getPlayer().getName()} reported the end credits finished with none pending`,
                    'ShowCreditsHandler/handle'
                );
            return;
        }

        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} reported the end credits started, which only the server may say`,
                'ShowCreditsHandler/handle'
            );
    }
}
