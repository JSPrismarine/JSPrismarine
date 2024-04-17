import type { PlayerSession } from '../../';
import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type LevelSoundEventPacket from '../packet/LevelSoundEventPacket';
import type PacketHandler from './PacketHandler';

export default class LevelSoundEventHandler implements PacketHandler<LevelSoundEventPacket> {
    public static NetID = Identifiers.LevelSoundEventPacket;

    public async handle(packet: LevelSoundEventPacket, _server: Server, session: PlayerSession): Promise<void> {
        await Promise.all(
            session
                .getPlayer()
                .getWorld()
                .getPlayers()
                .map((target) => target.getNetworkSession().send(packet))
        );
    }
}
