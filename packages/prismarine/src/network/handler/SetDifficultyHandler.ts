import { Difficulty } from '@jsprismarine/minecraft';
import SetDifficultyPacket from '@jsprismarine/protocol/bedrock/packet/SetDifficultyPacket';
import type { SessionContext } from './HandlerContext';
import type { ConnectionLaneHandler } from './SessionHandler';
import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';

/**
 * A client asking to change the world difficulty from its settings menu.
 *
 * The difficulty is read from the server config wherever it matters (mob damage, monster
 * spawning, `StartGamePacket`), and nothing changes it at run time, so the request is refused.
 * The client has already moved its own menu to the value it asked for, so the configured
 * difficulty is sent back to put the menu right. A value that is not a `Difficulty` is
 * treated the same way; nothing is thrown.
 */
export default class SetDifficultyHandler implements ConnectionLaneHandler<SetDifficultyPacket> {
    public static PacketName = 'SetDifficultyPacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'connection';

    /** Logs the request and sends the configured difficulty back when the two differ. */
    public async handle(packet: SetDifficultyPacket, { session, log, config }: SessionContext): Promise<void> {
        const data = packet.getPacketData();
        if (data === null) throw new PrismarineNetworkErrors.SetDifficultyNotDecoded();

        const configured = config.getDifficulty();
        if (data.difficulty === configured) return;

        log.debug(
            `${session.identity.name} asked for difficulty ${Difficulty[data.difficulty] ?? data.difficulty}, which the server does not change`
        );

        const reply = new SetDifficultyPacket({ difficulty: configured });
        await session.getConnection().sendDataPacket(reply);
    }
}
