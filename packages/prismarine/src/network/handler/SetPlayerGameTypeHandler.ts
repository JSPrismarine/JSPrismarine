import Identifiers from '../Identifiers';
import PacketHandler from './PacketHandler';
import { PlayerConnection } from '../../Prismarine';
import type Server from '../../Server';
import SetPlayerGameTypePacket from '../packet/SetPlayerGameTypePacket';

export default class SetPlayerGameTypeHandler implements PacketHandler<SetPlayerGameTypePacket> {
    public static NetID = Identifiers.SetPlayerGameTypePacket;

    public async handle(packet: SetPlayerGameTypePacket, _server: Server, connection: PlayerConnection): Promise<void> {
        const player = connection.getPlayer();
        if (!player.isOp()) {
            return;
        }

        await player.setGamemode(packet.gamemode);
    }
}
