import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import { MultiplayerSettingsPacketType } from '../packet/MultiplayerSettingsPacket';
import type MultiplayerSettingsPacket from '../packet/MultiplayerSettingsPacket';
import type PacketHandler from './PacketHandler';

/**
 * A request to change the multiplayer settings of an Education Edition session.
 *
 * The request is recorded at debug level and dropped. Known gap: Education Edition sessions
 * and join codes are not modeled, so the session stays as it is and no packet goes back to
 * the players in it.
 */
export default class MultiplayerSettingsHandler implements PacketHandler<MultiplayerSettingsPacket> {
    public static NetID = Identifiers.MultiplayerSettingsPacket;

    /** Logs the requested setting. */
    public handle(packet: MultiplayerSettingsPacket, server: Server, session: PlayerSession): void {
        const name = MultiplayerSettingsPacketType[packet.packetType] ?? `type ${packet.packetType}`;

        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} asked for multiplayer setting ${name}. Education Edition sessions are not modeled`,
                'MultiplayerSettingsHandler/handle'
            );
    }
}
