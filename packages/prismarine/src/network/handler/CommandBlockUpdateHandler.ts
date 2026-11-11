import type CommandBlockUpdatePacket from '@jsprismarine/protocol/packet/CommandBlockUpdatePacket';
import { CommandBlockMode } from '@jsprismarine/protocol/packet/CommandBlockUpdatePacket';
import type { SessionContext } from './HandlerContext';
import type { ConnectionLaneHandler } from './SessionHandler';

/**
 * A command block edit.
 *
 * The edit is recorded at debug level and dropped. Known gap: command blocks have no block
 * entity here, so there is no command to store and nothing runs on redstone or on a timer.
 */
export default class CommandBlockUpdateHandler implements ConnectionLaneHandler<CommandBlockUpdatePacket> {
    public static PacketName = 'CommandBlockUpdatePacket';
    public readonly takes = 'context';
    public readonly phases = ['play'] as const;
    public readonly lane = 'connection';

    /** Logs the target and the command. */
    public handle(packet: CommandBlockUpdatePacket, { session, log }: SessionContext): void {
        const data = packet.getPacketData();
        if (data === null) throw new Error('Cannot handle a CommandBlockUpdatePacket without decoded data');

        const { target } = data;
        const where = target.isBlock
            ? `the ${CommandBlockMode[target.commandBlockMode] ?? target.commandBlockMode} command block at ${target.blockPosition.x}, ${target.blockPosition.y}, ${target.blockPosition.z}`
            : `command block minecart ${target.targetRuntimeId}`;

        log.debug(
            `${session.identity.name} set ${where} to "${data.command}". Command blocks are not stored, so nothing changed`,
            'CommandBlockUpdateHandler/handle'
        );
    }
}
