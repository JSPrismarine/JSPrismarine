import type LevelSoundEventPacket from '../packet/LevelSoundEventPacket';
import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';

export default class LevelSoundEventHandler
    implements PacketHandler<LevelSoundEventPacket> {
    public handle(
        packet: LevelSoundEventPacket,
        server: Prismarine,
        player: Player
    ): void {
        // TODO: broadcast to viewers
        for (const chunkPlayer of player.getPlayersInChunk()) {
            chunkPlayer.getConnection().sendDataPacket(packet);
        }
    }
}
