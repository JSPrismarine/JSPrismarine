import type ServerboundLoadingScreenPacket from '@jsprismarine/protocol/packet/ServerboundLoadingScreenPacket';
import { ServerboundLoadingScreenPacketType } from '@jsprismarine/protocol/packet/ServerboundLoadingScreenPacket';
import type { InputContext } from './HandlerContext';
import type { InputLaneHandler } from './SessionHandler';

/**
 * The client reporting a loading screen edge.
 *
 * The join screen carries no id. A dimension change carries the id the server put in its
 * `ChangeDimensionPacket`, handed out by `PlayerSession.beginLoadingScreen`; when the client
 * reports that screen closed, the id is checked off against the session's open screens, and
 * the id of a pending `PlayerSession.changeWorld` finishes that change. Every edge is
 * recorded at debug level; a closed screen that is not the pending change's is logged as such
 * and otherwise ignored.
 */
export default class ServerboundLoadingScreenHandler implements InputLaneHandler<ServerboundLoadingScreenPacket> {
    public static PacketName = 'ServerboundLoadingScreenPacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'input';

    /**
     * Logs which screen opened or closed, closes a dimension change's screen on the session,
     * and finishes the pending world change when the closed screen is its.
     */
    public handle(packet: ServerboundLoadingScreenPacket, { session, log, step }: InputContext): undefined {
        const data = packet.getPacketData();
        if (data === null) throw new Error('Cannot handle a ServerboundLoadingScreenPacket without a payload');
        const closed = data.loadingScreenType === ServerboundLoadingScreenPacketType.EndLoadingScreen;
        const edge =
            data.loadingScreenType === ServerboundLoadingScreenPacketType.StartLoadingScreen
                ? 'opened'
                : closed
                  ? 'closed'
                  : `sent type ${data.loadingScreenType} for`;
        const screen =
            data.loadingScreenId === null ? 'the join loading screen' : `loading screen ${data.loadingScreenId}`;
        const closedId = closed ? data.loadingScreenId : null;
        const pending = session.pendingDimensionChange();
        const known =
            closedId !== null && !session.endLoadingScreen(closedId)
                ? ', which this session never opened'
                : closedId !== null && pending !== undefined && pending.loadingScreenId !== closedId
                  ? `, not screen ${pending.loadingScreenId} of the pending dimension change`
                  : '';

        const report = (released: boolean) =>
            log.debug(
                `${session.identity.name} ${edge} ${screen}${known}${released ? '; sending its arrival columns' : ''}`,
                'ServerboundLoadingScreenHandler/handle'
            );

        const openedId =
            data.loadingScreenType === ServerboundLoadingScreenPacketType.StartLoadingScreen
                ? data.loadingScreenId
                : null;
        if (openedId !== null) {
            // The session marks the columns released before it sends them, so what is left is
            // chunk delivery, a send the step waits for.
            step.output(session.releaseArrivalChunks(openedId).then(report));
            return;
        }

        report(false);

        // The change ends in this input's unit: the arrival's sends are queued, then the
        // advancement hook runs, in the order the client has always seen them, and a held change
        // is filed as a message for the next input step rather than started here.
        if (closedId !== null) session.completeDimensionChange(closedId);
    }
}
