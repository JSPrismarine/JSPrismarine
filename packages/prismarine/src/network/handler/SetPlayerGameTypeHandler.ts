import Identifiers from '../Identifiers.js';
import PacketHandler from './PacketHandler.js';
import { PlayerSession } from '../../Prismarine.js';
import type Server from '../../Server.js';
import SetPlayerGameTypePacket from '../packet/SetPlayerGameTypePacket.js';

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
