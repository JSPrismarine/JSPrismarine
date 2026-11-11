import { MultiplayerSettingsPacketType } from '@jsprismarine/protocol/packet/MultiplayerSettingsPacket';
import type MultiplayerSettingsPacket from '@jsprismarine/protocol/packet/MultiplayerSettingsPacket';
import type { SessionContext } from './HandlerContext';
import type { ConnectionLaneHandler } from './SessionHandler';

/**
 * A request to change the multiplayer settings of an Education Edition session.
 *
 * The request is recorded at debug level and dropped. Known gap: Education Edition sessions
 * and join codes are not modeled, so the session stays as it is and no packet goes back to
 * the players in it.
 */
export default class MultiplayerSettingsHandler implements ConnectionLaneHandler<MultiplayerSettingsPacket> {
    public static PacketName = 'MultiplayerSettingsPacket';
    public readonly takes = 'context';
    public readonly phases = ['play'] as const;
    public readonly lane = 'connection';

    /** Logs the requested setting. */
    public handle(packet: MultiplayerSettingsPacket, { session, log }: SessionContext): void {
        const name = MultiplayerSettingsPacketType[packet.packetType] ?? `type ${packet.packetType}`;

        log.debug(
            `${session.identity.name} asked for multiplayer setting ${name}. Education Edition sessions are not modeled`,
            'MultiplayerSettingsHandler/handle'
        );
    }
}
