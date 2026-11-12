import { Gametype } from '@jsprismarine/minecraft';

import type SetPlayerGameTypePacket from '@jsprismarine/protocol/packet/SetPlayerGameTypePacket';
import type { InputContext } from './HandlerContext';
import type { InputLaneHandler } from './SessionHandler';

const isGametype = (value: number): value is Gametype => Gametype[value] !== undefined;

/** The sender as this handler sees it: what the permission check reads, and the change. */
interface GamemodePlayer {
    isOp(): boolean;
    getPermissions(): string[];
    setGamemode(mode: Gametype): Promise<void>;
}

/**
 * Applies the game type a client picked from its dropdown.
 *
 * Only a player who may run `minecraft.command.gamemode` gets the change. Anyone else, and any
 * value that is not a `Gametype`, gets the current game type sent back so the client's
 * dropdown returns to what the server holds.
 */
export default class SetPlayerGameTypeHandler implements InputLaneHandler<SetPlayerGameTypePacket> {
    public static PacketName = 'SetPlayerGameTypePacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'input';

    /** Applies the requested game type, or resends the current one when the request is refused. */
    public handle(packet: SetPlayerGameTypePacket, { session, services, step }: InputContext): undefined {
        const data = packet.getPacketData();
        if (data === null) throw new Error('Cannot handle SetPlayerGameTypePacket without decoded data');

        const player: GamemodePlayer = session;
        const allowed = services.permissions.can(player).execute('minecraft.command.gamemode');
        if (!allowed || !isGametype(data.gametype)) {
            step.output(session.sendGamemode());
            return;
        }

        // In this input's unit: `setGamemode` writes the game mode and queues its packets before
        // it returns, and what it hands back only waits for the transport.
        step.output(player.setGamemode(data.gametype));
    }
}
