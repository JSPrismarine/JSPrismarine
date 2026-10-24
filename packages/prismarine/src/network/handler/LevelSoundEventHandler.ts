import { Vector3 } from '@jsprismarine/math';
import type { PlayerSession } from '../../';
import type Server from '../../Server';
import { CREATIVE_REACH } from '../../entity/Combat';
import { SOUND_RADIUS } from '../../world/Proximity';
import Identifiers from '../Identifiers';
import type LevelSoundEventPacket from '../packet/LevelSoundEventPacket';
import type PacketHandler from './PacketHandler';

/**
 * How far from the sender a client-sent sound may claim to have happened.
 *
 * Every sound a vanilla client reports is something it just did - a step, a block placed, a
 * bow loosed - so all of them land within arm's length of it. The position is taken from the
 * packet and the sound is played to whoever is near *that*, so without a bound a client can
 * make any noise in the game come out of any point in the world. `CREATIVE_REACH` plus a
 * block of slack is the furthest anything a player does reaches.
 */
const MAX_SOUND_DISTANCE = CREATIVE_REACH + 1;

/** Relays a sound a client reported to the other players near where it happened. */
export default class LevelSoundEventHandler implements PacketHandler<LevelSoundEventPacket> {
    public static NetID = Identifiers.LevelSoundEventPacket;

    /** Broadcasts the sound from its own position, unless that position is not the sender's. */
    public async handle(packet: LevelSoundEventPacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        const position = new Vector3(packet.positionX, packet.positionY, packet.positionZ);

        const distance = player.getPosition().distanceTo(position);
        if (!Number.isFinite(distance) || distance > MAX_SOUND_DISTANCE) {
            server
                .getLogger()
                .verbose(
                    `Dropped sound ${packet.sound} from ${player.getName()}, reported ${distance.toFixed(1)} away`,
                    'LevelSoundEventHandler/handle'
                );
            return;
        }

        // Relayed through the world's replicator rather than through the world itself: this
        // is a packet a client sent being handed to other clients, which is network business
        // from end to end and never was the world's.
        //
        // The sound carries its own position, so it is broadcast from there rather than from
        // the player - and only as far as a sound should carry.
        //
        // The sender is left out: the client that sent this has already played it locally, and
        // echoing it back played everything twice for whoever made the noise.
        server.getWorldReplicators().for(player.getWorld()).sendAround(position, packet, {
            radius: SOUND_RADIUS,
            exclude: player
        });
    }
}
