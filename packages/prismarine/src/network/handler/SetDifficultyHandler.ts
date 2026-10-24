import { Difficulty } from '@jsprismarine/minecraft';
import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import type SetDifficultyPacket from '../packet/SetDifficultyPacket';
import type PacketHandler from './PacketHandler';

/**
 * A client asking to change the world difficulty.
 *
 * The request is recorded at debug level and the difficulty stays as configured. Known gap:
 * the server has no permission check or world setting for a client-driven difficulty change,
 * so it neither applies nor reverts it on the client.
 */
export default class SetDifficultyHandler implements PacketHandler<SetDifficultyPacket> {
    public static NetID = Identifiers.SetDifficultyPacket;

    /** Logs the requested difficulty. */
    public handle(packet: SetDifficultyPacket, server: Server, session: PlayerSession): void {
        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} asked for difficulty ${Difficulty[packet.difficulty] ?? packet.difficulty}, which the server does not change`,
                'SetDifficultyHandler/handle'
            );
    }
}
