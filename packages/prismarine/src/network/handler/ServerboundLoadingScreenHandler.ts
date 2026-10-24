import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type ServerboundLoadingScreenPacket from '../packet/ServerboundLoadingScreenPacket';
import { LoadingScreenPacketType } from '../packet/ServerboundLoadingScreenPacket';
import type PacketHandler from './PacketHandler';

/**
 * The client reporting a loading screen edge.
 *
 * The server never assigns a loading screen id, so the only screens a client reports are the
 * join screen and dimension changes. Both are recorded at debug level and nothing is sent back.
 */
export default class ServerboundLoadingScreenHandler implements PacketHandler<ServerboundLoadingScreenPacket> {
    public static NetID = Identifiers.ServerboundLoadingScreenPacket;

    /** Logs which screen opened or closed. */
    public handle(packet: ServerboundLoadingScreenPacket, server: Server, session: PlayerSession): void {
        const edge =
            packet.loadingScreenType === LoadingScreenPacketType.StartLoadingScreen
                ? 'opened'
                : packet.loadingScreenType === LoadingScreenPacketType.EndLoadingScreen
                  ? 'closed'
                  : `sent type ${packet.loadingScreenType} for`;
        const screen =
            packet.loadingScreenId === null ? 'the join loading screen' : `loading screen ${packet.loadingScreenId}`;

        server
            .getLogger()
            .debug(`${session.getPlayer().getName()} ${edge} ${screen}`, 'ServerboundLoadingScreenHandler/handle');
    }
}
