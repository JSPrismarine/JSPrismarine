import Identifiers from '../Identifiers';
import type LevelSoundEventPacket from '../packet/LevelSoundEventPacket';
import PacketHandler from './PacketHandler';
import { PlayerConnection } from '../../Prismarine';
import type Server from '../../Server';

export default class LevelSoundEventHandler implements PacketHandler<LevelSoundEventPacket> {
    public static NetID = Identifiers.LevelSoundEventPacket;

    public async handle(packet: LevelSoundEventPacket, _server: Server, connection: PlayerConnection): Promise<void> {
        // TODO: broadcast to viewers
        for (const chunkPlayer of connection.getPlayer().getPlayersInChunk()) {
            await chunkPlayer.getConnection().sendDataPacket(packet);
        }
    }
}
