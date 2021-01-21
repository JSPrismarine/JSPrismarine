import type LevelSoundEventPacket from '../packet/LevelSoundEventPacket';
import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import type Server from '../../Server';

export default class LevelSoundEventHandler implements PacketHandler<LevelSoundEventPacket> {
    public async handle(
        packet: LevelSoundEventPacket,
        server: Server,
        player: Player
    ): Promise<void> {
        // TODO: broadcast to viewers
        for (const chunkPlayer of player.getPlayersInChunk()) {
            await chunkPlayer.getConnection().sendDataPacket(packet);
        }
    }
}
