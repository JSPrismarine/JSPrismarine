import { Gametype } from '@jsprismarine/minecraft';

import type { PlayerSession } from '../../';
import type Server from '../../Server';
import type SetPlayerGameTypePacket from '../packet/SetPlayerGameTypePacket';
import type PacketHandler from './PacketHandler';

/**
 * Applies the game type a client picked from its dropdown.
 *
 * Only a player who may run `minecraft.command.gamemode` gets the change. Anyone else, and any
 * value that is not a `Gametype`, gets the current game type sent back so the client's
 * dropdown returns to what the server holds.
 */
export default class SetPlayerGameTypeHandler implements PacketHandler<SetPlayerGameTypePacket> {
    public static PacketName = 'SetPlayerGameTypePacket';
    public readonly phases = ['play'] as const;

    /** Applies the requested game type, or resends the current one when the request is refused. */
    public async handle(packet: SetPlayerGameTypePacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        const allowed = server.getPermissionManager().can(player).execute('minecraft.command.gamemode');
        if (!allowed || Gametype[packet.gametype] === undefined) {
            await session.sendGamemode();
            return;
        }

        await player.setGamemode(packet.gametype);
    }
}
