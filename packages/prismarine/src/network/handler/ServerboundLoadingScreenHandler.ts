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
 * reports that screen closed, the id is checked off against the session's open screens.
 * Everything is recorded at debug level and nothing is sent back.
 */
export default class ServerboundLoadingScreenHandler implements PacketHandler<ServerboundLoadingScreenPacket> {
    public static PacketName = 'ServerboundLoadingScreenPacket';
    public readonly phases = ['play'] as const;

    /** Logs which screen opened or closed, and closes a dimension change's screen on the session. */
    public handle(packet: ServerboundLoadingScreenPacket, server: Server, session: PlayerSession): void {
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
        const known =
            closed && data.loadingScreenId !== null && !session.endLoadingScreen(data.loadingScreenId)
                ? ', which this session never opened'
                : '';

        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} ${edge} ${screen}${known}`,
                'ServerboundLoadingScreenHandler/handle'
            );
    }
}
