import type ServerboundPackSettingChangePacket from '@jsprismarine/protocol/packet/ServerboundPackSettingChangePacket';
import type { SessionContext } from './HandlerContext';
import type { ConnectionLaneHandler } from './SessionHandler';

/**
 * A pack setting change.
 *
 * The server ships no packs with settings, so the change is recorded at debug level and
 * dropped. Nothing is persisted and other players are not told.
 */
export default class ServerboundPackSettingChangeHandler implements ConnectionLaneHandler<ServerboundPackSettingChangePacket> {
    public static PacketName = 'ServerboundPackSettingChangePacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'connection';

    /** Logs the pack, the setting, and the new value. */
    public handle(packet: ServerboundPackSettingChangePacket, { session, log }: SessionContext): void {
        const data = packet.getPacketData();
        if (data === null) throw new Error('Cannot handle a ServerboundPackSettingChangePacket without a payload');
        log.debug(
            `${session.identity.name} set ${data.packSettingName} of pack ${data.packId.toString()} to ${JSON.stringify(data.packSettingValue)}, which the server does not store`,
            'ServerboundPackSettingChangeHandler/handle'
        );
    }
}
