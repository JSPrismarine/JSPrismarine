import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type ServerboundLoadingScreenPacket from '@jsprismarine/protocol/packet/ServerboundLoadingScreenPacket';
import { ServerboundLoadingScreenPacketType } from '@jsprismarine/protocol/packet/ServerboundLoadingScreenPacket';
import type PacketHandler from './PacketHandler';

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
export default class ServerboundLoadingScreenHandler implements PacketHandler<ServerboundLoadingScreenPacket> {
    public static PacketName = 'ServerboundLoadingScreenPacket';
    public readonly phases = ['play'] as const;

    /**
     * Logs which screen opened or closed, closes a dimension change's screen on the session,
     * and finishes the pending world change when the closed screen is its.
     */
    public async handle(packet: ServerboundLoadingScreenPacket, server: Server, session: PlayerSession): Promise<void> {
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

        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} ${edge} ${screen}${known}`,
                'ServerboundLoadingScreenHandler/handle'
            );

        if (closedId !== null) await session.completeDimensionChange(closedId);
    }
}
