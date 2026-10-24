import { Difficulty } from '@jsprismarine/minecraft';
import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import SetDifficultyPacket from '../packet/SetDifficultyPacket';
import type PacketHandler from './PacketHandler';

/**
 * A client asking to change the world difficulty from its settings menu.
 *
 * The difficulty is read from the server config wherever it matters (mob damage, monster
 * spawning, `StartGamePacket`), and nothing changes it at run time, so the request is refused.
 * The client has already moved its own menu to the value it asked for, so the configured
 * difficulty is sent back to put the menu right. A value that is not a `Difficulty` is
 * treated the same way; nothing is thrown.
 */
export default class SetDifficultyHandler implements PacketHandler<SetDifficultyPacket> {
    public static NetID = Identifiers.SetDifficultyPacket;

    /** Logs the request and sends the configured difficulty back when the two differ. */
    public async handle(packet: SetDifficultyPacket, server: Server, session: PlayerSession): Promise<void> {
        const configured = server.getConfig().getDifficulty();
        if (packet.difficulty === configured) return;

        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} asked for difficulty ${Difficulty[packet.difficulty] ?? packet.difficulty}, which the server does not change`,
                'SetDifficultyHandler/handle'
            );

        const reply = new SetDifficultyPacket();
        reply.difficulty = configured;
        await session.getConnection().sendDataPacket(reply);
    }
}
