import type { PlayerSession } from '../../';
import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type SetDefaultGameTypePacket from '../packet/SetDefaultGameTypePacket';
import type PacketHandler from './PacketHandler';

/**
 * Applies the default game type a client picked from the world settings screen.
 *
 * Only an operator gets the change. Anyone else is refused and logged, and the server's own
 * default stands - the client's screen is left to be corrected by the game type the server
 * sends each player.
 */
export default class SetDefaultGameTypeHandler implements PacketHandler<SetDefaultGameTypePacket> {
    public static NetID = Identifiers.SetDefaultGameTypePacket;

    /** Sets the configured default and moves every player onto it, when the sender may. */
    public async handle(packet: SetDefaultGameTypePacket, server: Server, session: PlayerSession): Promise<void> {
        if (!session.getPlayer().isOp()) {
            server
                .getLogger()
                .warn(
                    `Player ${session.getPlayer().getName()} tried to change default gamemode without proper permissions.`
                );
            return;
        }

        server.getConfig().setGamemode(packet.gamemode, true);
        await Promise.all(
            server
                .getSessionManager()
                .getAllPlayers()
                .map(async (player) => {
                    await player.setGamemode(packet.gamemode);
                })
        );
    }
}
