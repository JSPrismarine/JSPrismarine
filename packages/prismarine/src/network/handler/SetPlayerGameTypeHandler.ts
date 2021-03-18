import Identifiers from '../Identifiers';
import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import type Server from '../../Server';
import SetPlayerGameTypePacket from '../packet/SetPlayerGameTypePacket';

export default class SetPlayerGameTypeHandler implements PacketHandler<SetPlayerGameTypePacket> {
    public static NetID = Identifiers.SetPlayerGameTypePacket;

    public async handle(packet: SetPlayerGameTypePacket, server: Server, player: Player): Promise<void> {
        if (!player.isOp()) {
            return;
        }

        await player.setGamemode(packet.gamemode);
    }
}
