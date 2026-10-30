import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type ServerboundPackSettingChangePacket from '@jsprismarine/protocol/packet/ServerboundPackSettingChangePacket';
import type PacketHandler from './PacketHandler';

/**
 * A pack setting change.
 *
 * The server ships no packs with settings, so the change is recorded at debug level and
 * dropped. Nothing is persisted and other players are not told.
 */
export default class ServerboundPackSettingChangeHandler implements PacketHandler<ServerboundPackSettingChangePacket> {
    public static PacketName = 'ServerboundPackSettingChangePacket';
    public readonly phases = ['play'] as const;

    /** Logs the pack, the setting, and the new value. */
    public handle(packet: ServerboundPackSettingChangePacket, server: Server, session: PlayerSession): void {
        const data = packet.getPacketData();
        if (data === null) throw new Error('Cannot handle a ServerboundPackSettingChangePacket without a payload');
        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} set ${data.packSettingName} of pack ${data.packId.toString()} to ${JSON.stringify(data.packSettingValue)}, which the server does not store`,
                'ServerboundPackSettingChangeHandler/handle'
            );
    }
}
