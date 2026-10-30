import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type SettingsCommandPacket from '@jsprismarine/protocol/packet/SettingsCommandPacket';
import type PacketHandler from './PacketHandler';

/**
 * A command issued from a settings screen.
 *
 * The command line runs through the command manager, which checks the sender's permission,
 * so a player who may not run `/gamerule` cannot change a world setting from the menu.
 * Known gap: Suppress Output? is read and ignored, because the command manager has no quiet
 * mode and sends its messages straight to the player.
 */
export default class SettingsCommandHandler implements PacketHandler<SettingsCommandPacket> {
    public static PacketName = 'SettingsCommandPacket';
    public readonly phases = ['play'] as const;

    /** Dispatches the command line as the player who sent it. */
    public async handle(packet: SettingsCommandPacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        const data = packet.getPacketData();
        if (data === null) throw new Error('Cannot handle a SettingsCommandPacket without decoded data');
        await server.getCommandManager().dispatchCommand(player, player, data.command);
    }
}
