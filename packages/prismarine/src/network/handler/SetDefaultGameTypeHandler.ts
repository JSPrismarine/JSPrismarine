import type { Gametype, GametypeName } from '@jsprismarine/minecraft';
import { getGametypeId, getGametypeName } from '@jsprismarine/minecraft';

import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import SetDefaultGameTypePacket from '../packet/SetDefaultGameTypePacket';
import type PacketHandler from './PacketHandler';

/**
 * The name the config stores for a default, or null when it has none for the value.
 *
 * `getGametypeName` is what `Config.setGamemode` goes through, so it decides what a default
 * can be: Survival, Creative, Adventure or Spectator. It throws for the rest, which a client
 * is free to send (`Default`, `WorldDefault`, or any number at all).
 */
const nameOfDefault = (gamemode: Gametype): GametypeName | null => {
    try {
        return getGametypeName(gamemode);
    } catch {
        return null;
    }
};

/**
 * Applies the default game type a client picked from the world settings screen.
 *
 * Only an operator gets the change, and only for a value the config can hold. A refused
 * request is answered with the default the server has, because the client has already moved
 * its screen to the value it asked for. An accepted one is written to the config, applied to
 * every player, and then sent to every client, which is what the docs describe.
 */
export default class SetDefaultGameTypeHandler implements PacketHandler<SetDefaultGameTypePacket> {
    public static PacketName = 'SetDefaultGameTypePacket';

    /** Sets the configured default and moves every player onto it, when the sender may. */
    public async handle(packet: SetDefaultGameTypePacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        if (!player.isOp()) {
            server
                .getLogger()
                .warn(`Player ${player.getName()} tried to change default gamemode without proper permissions.`);
            await this.sendDefault(server, session);
            return;
        }

        if (nameOfDefault(packet.gamemode) === null) {
            server
                .getLogger()
                .debug(
                    `${player.getName()} asked for default game type ${packet.gamemode}, which a server cannot hold`,
                    'SetDefaultGameTypeHandler/handle'
                );
            await this.sendDefault(server, session);
            return;
        }

        server.getConfig().setGamemode(packet.gamemode, true);
        const players = server.getSessionManager().getAllPlayers();
        await Promise.all(players.map(async (target) => target.setGamemode(packet.gamemode)));
        await Promise.all(players.map(async (target) => this.sendDefault(server, target.getNetworkSession())));
    }

    /** Tells one client the default the server holds. */
    private async sendDefault(server: Server, session: PlayerSession): Promise<void> {
        const reply = new SetDefaultGameTypePacket();
        reply.gamemode = getGametypeId(server.getConfig().getGamemode());
        await session.getConnection().sendDataPacket(reply);
    }
}
