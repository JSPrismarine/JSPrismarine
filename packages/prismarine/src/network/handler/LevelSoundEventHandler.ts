import { Vector3 } from '@jsprismarine/math';
import type { PlayerSession } from '../../';
import type Server from '../../Server';
import { SOUND_RADIUS } from '../../world/Proximity';
import Identifiers from '../Identifiers';
import type LevelSoundEventPacket from '../packet/LevelSoundEventPacket';
import type PacketHandler from './PacketHandler';

export default class LevelSoundEventHandler implements PacketHandler<LevelSoundEventPacket> {
    public static NetID = Identifiers.LevelSoundEventPacket;

    public async handle(packet: LevelSoundEventPacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();

        // Relayed through the world's replicator rather than through the world itself: this
        // is a packet a client sent being handed to other clients, which is network business
        // from end to end and never was the world's.
        //
        // The sound carries its own position, so it is broadcast from there rather than from
        // the player - and only as far as a sound should carry.
        //
        // The sender is left out: the client that sent this has already played it locally, and
        // echoing it back played everything twice for whoever made the noise.
        server
            .getWorldReplicators()
            .for(player.getWorld())
            .sendAround(new Vector3(packet.positionX, packet.positionY, packet.positionZ), packet, {
                radius: SOUND_RADIUS,
                exclude: player
            });
    }
}
