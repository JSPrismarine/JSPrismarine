import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type SettingsCommandPacket from '../packet/SettingsCommandPacket';
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
    public static NetID = Identifiers.SettingsCommandPacket;

    /** Dispatches the command line as the player who sent it. */
    public async handle(packet: SettingsCommandPacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        await server.getCommandManager().dispatchCommand(player, player, packet.command);
    }
}
