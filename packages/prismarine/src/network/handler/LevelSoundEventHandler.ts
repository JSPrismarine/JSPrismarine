import { Vector3 } from '@jsprismarine/math';
import { LevelSoundEventName } from '@jsprismarine/minecraft';
import type { PlayerSession } from '../../';
import type Server from '../../Server';
import { CREATIVE_REACH } from '../../entity/Combat';
import { SOUND_RADIUS } from '../../world/Proximity';
import type LevelSoundEventPacket from '@jsprismarine/protocol/packet/LevelSoundEventPacket';
import type PacketHandler from './PacketHandler';

/**
 * How far from the sender a client-sent sound may claim to have happened.
 *
 * Every sound a vanilla client reports is something it just did, such as a step, a block
 * placed, or a bow loosed, so all of them land within arm's length of it. The position is
 * taken from the packet and the sound is played to whoever is near that point, so without a
 * bound a client can make any noise in the game come out of any point in the world.
 * `CREATIVE_REACH` plus a block of slack is the furthest anything a player does reaches.
 */
const MAX_SOUND_DISTANCE = CREATIVE_REACH + 1;

/**
 * The `Actor Identifier` values a client sends for a sound with no actor of its own.
 *
 * An empty `ActorDefinitionIdentifier` renders as `:` on the wire, and some sounds carry the
 * empty string instead.
 */
const NO_ACTOR_TYPES = new Set(['', ':']);

/** Relays a sound a client reported to the other players near where it happened. */
export default class LevelSoundEventHandler implements PacketHandler<LevelSoundEventPacket> {
    public static PacketName = 'LevelSoundEventPacket';
    public readonly phases = ['play'] as const;

    /**
     * Broadcasts the sound from its own position when it is the sender's to make: attributed
     * to the sender or to no actor, and within reach of where the sender stands.
     *
     * The sound goes out as the instance the client sent. The packet codec preserves its
     * decoded fields, and the relay carries the same layout the client used, `Fire At Position`
     * and any sound name outside the enum included.
     */
    public async handle(packet: LevelSoundEventPacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        const position = new Vector3(packet.positionX, packet.positionY, packet.positionZ);

        const drop = (reason: string) => {
            const sound = LevelSoundEventName[packet.sound] ?? packet.sound;
            server
                .getLogger()
                .verbose(`Dropped sound ${sound} from ${player.getName()}: ${reason}`, 'LevelSoundEventHandler/handle');
        };

        // A client only knows about the sounds it started, so the actor is itself or nobody.
        // This server hands out the runtime id as the unique id, so the sender's own is that.
        if (packet.entityUniqueId !== -1n && packet.entityUniqueId !== player.getRuntimeId()) {
            drop(`attributed to actor ${packet.entityUniqueId}`);
            return;
        }

        if (!NO_ACTOR_TYPES.has(packet.entityType) && packet.entityType !== player.getType()) {
            drop(`attributed to a ${packet.entityType}`);
            return;
        }

        const distance = player.getPosition().distanceTo(position);
        if (!Number.isFinite(distance) || distance > MAX_SOUND_DISTANCE) {
            drop(`reported ${distance.toFixed(1)} away`);
            return;
        }

        // Relayed through the world's replicator rather than through the world itself: this
        // is a packet a client sent being handed to other clients, which is network business
        // from end to end and never was the world's.
        //
        // The sound carries its own position, so it is broadcast from there rather than from
        // the player, and only as far as a sound should carry.
        //
        // The sender is left out: the client that sent this has already played it locally, and
        // echoing it back played everything twice for whoever made the noise.
        server.getWorldReplicators().for(player.getWorld()).sendAround(position, packet, {
            radius: SOUND_RADIUS,
            exclude: player
        });
    }
}
