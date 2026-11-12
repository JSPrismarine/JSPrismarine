import type ShowCreditsPacket from '@jsprismarine/protocol/packet/ShowCreditsPacket';
import { CreditsState } from '@jsprismarine/protocol/packet/ShowCreditsPacket';
import type { InputContext } from './HandlerContext';
import type { InputLaneHandler } from './SessionHandler';

/**
 * The client reporting that the end credits have finished.
 *
 * The server starts the credits through `PlayerSession.startCredits` when a player first
 * leaves the End, holding the resolved arrival; the `Finished` reply completes that held
 * world change. A finish with no credits pending, or a client-sent `Start`, is logged at
 * debug and dropped.
 */
export default class ShowCreditsHandler implements InputLaneHandler<ShowCreditsPacket> {
    public static PacketName = 'ShowCreditsPacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'input';

    /** Completes the held world change on `Finished`, and drops anything else. */
    public handle(packet: ShowCreditsPacket, { session, log }: InputContext): undefined {
        if (packet.creditsState === CreditsState.Finished) {
            // The held change is a message the next input step carries out, so nothing here waits.
            if (session.completeCredits()) return;

            log.debug(
                `${session.identity.name} reported the end credits finished with none pending`,
                'ShowCreditsHandler/handle'
            );
            return;
        }

        log.debug(
            `${session.identity.name} reported the end credits started, which only the server may say`,
            'ShowCreditsHandler/handle'
        );
    }
}
