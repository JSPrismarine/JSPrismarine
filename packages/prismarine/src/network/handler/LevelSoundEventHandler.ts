import Identifiers from '../Identifiers';
import type LevelSoundEventPacket from '../packet/LevelSoundEventPacket';
import type PacketHandler from './PacketHandler';
import type { PlayerSession } from '../../';
import type Server from '../../Server';

export default class LevelSoundEventHandler implements PacketHandler<LevelSoundEventPacket> {
    public static NetID = Identifiers.LevelSoundEventPacket;

    public async handle(packet: LevelSoundEventPacket, _server: Server, session: PlayerSession): Promise<void> {
        // TODO: broadcast to viewers
        for (const chunkPlayer of session.getPlayer().getPlayersInChunk()) {
            await chunkPlayer.getNetworkSession().getConnection().sendDataPacket(packet);
        }
    }
}
