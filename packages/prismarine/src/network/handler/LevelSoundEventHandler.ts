import Identifiers from '../Identifiers.js';
import type LevelSoundEventPacket from '../packet/LevelSoundEventPacket.js';
import PacketHandler from './PacketHandler.js';
import { PlayerSession } from '../../Prismarine.js';
import type Server from '../../Server.js';

export default class LevelSoundEventHandler implements PacketHandler<LevelSoundEventPacket> {
    public static NetID = Identifiers.LevelSoundEventPacket;

    public async handle(packet: LevelSoundEventPacket, _server: Server, session: PlayerSession): Promise<void> {
        // TODO: broadcast to viewers
        for (const chunkPlayer of session.getPlayer().getPlayersInChunk()) {
            await chunkPlayer.getNetworkSession().getConnection().sendDataPacket(packet);
        }
    }
}
