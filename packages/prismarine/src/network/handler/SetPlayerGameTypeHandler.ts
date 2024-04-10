import Identifiers from '../Identifiers';
import type PacketHandler from './PacketHandler';
import type { PlayerSession } from '../../';
import type Server from '../../Server';
import type SetPlayerGameTypePacket from '../packet/SetPlayerGameTypePacket';

export default class SetPlayerGameTypeHandler implements PacketHandler<SetPlayerGameTypePacket> {
    public static NetID = Identifiers.SetPlayerGameTypePacket;

    public async handle(packet: SetPlayerGameTypePacket, _server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        if (!player.isOp()) {
            return;
        }

        await player.setGamemode(packet.gamemode);
    }
}
