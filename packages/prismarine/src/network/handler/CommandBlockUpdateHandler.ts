import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type CommandBlockUpdatePacket from '../packet/CommandBlockUpdatePacket';
import { CommandBlockMode } from '../packet/CommandBlockUpdatePacket';
import type PacketHandler from './PacketHandler';

/**
 * A command block edit.
 *
 * The edit is recorded at debug level and dropped. Known gap: command blocks have no block
 * entity here, so there is no command to store and nothing runs on redstone or on a timer.
 */
export default class CommandBlockUpdateHandler implements PacketHandler<CommandBlockUpdatePacket> {
    public static PacketName = 'CommandBlockUpdatePacket';
    public readonly phases = ['play'] as const;

    /** Logs the target and the command. */
    public handle(packet: CommandBlockUpdatePacket, server: Server, session: PlayerSession): void {
        const { target } = packet;
        const where = target.isBlock
            ? `the ${CommandBlockMode[target.commandBlockMode] ?? target.commandBlockMode} command block at ${target.blockPosition.getX()}, ${target.blockPosition.getY()}, ${target.blockPosition.getZ()}`
            : `command block minecart ${target.targetRuntimeId}`;

        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} set ${where} to "${packet.command}". Command blocks are not stored, so nothing changed`,
                'CommandBlockUpdateHandler/handle'
            );
    }
}
