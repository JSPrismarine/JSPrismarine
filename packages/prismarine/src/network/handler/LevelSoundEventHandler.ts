import { Vector3 } from '@jsprismarine/math';
import { LevelSoundEventName } from '@jsprismarine/minecraft';
import { CREATIVE_REACH } from '../../entity/Combat';
import { PLAYER_IDENTIFIER } from '../../entity/playerOverlay';
import type LevelSoundEventPacket from '@jsprismarine/protocol/packet/LevelSoundEventPacket';
import type { InputContext } from './HandlerContext';
import type { InputLaneHandler } from './SessionHandler';

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
export default class LevelSoundEventHandler implements InputLaneHandler<LevelSoundEventPacket> {
    public static PacketName = 'LevelSoundEventPacket';
    public readonly phases = ['play'] as const;
    // Logs an occurrence that replication relays to the players near the sound.
    public readonly lane = 'input';

    /**
     * Broadcasts the sound from its own position when it is the sender's to make: attributed
     * to the sender or to no actor, and within reach of where the sender stands.
     *
     * The sound goes out with every field the client sent, `Fire At Position` included. A
     * sound name outside the enum decodes to -1 and goes out as an empty name, as it always did.
     */
    public handle(packet: LevelSoundEventPacket, { session, log }: InputContext): undefined {
        const position = new Vector3(packet.positionX, packet.positionY, packet.positionZ);

        const drop = (reason: string) => {
            const sound = LevelSoundEventName[packet.sound] ?? packet.sound;
            log.verbose(
                `Dropped sound ${sound} from ${session.identity.name}: ${reason}`,
                'LevelSoundEventHandler/handle'
            );
        };

        // A client only knows about the sounds it started, so the actor is itself or nobody.
        // This server hands out the runtime id as the unique id, so the sender's own is that.
        if (packet.entityUniqueId !== -1n && packet.entityUniqueId !== session.runtimeId) {
            drop(`attributed to actor ${packet.entityUniqueId}`);
            return;
        }

        if (!NO_ACTOR_TYPES.has(packet.entityType) && packet.entityType !== PLAYER_IDENTIFIER) {
            drop(`attributed to a ${packet.entityType}`);
            return;
        }

        const distance = session.getPlayer().getPosition().distanceTo(position);
        if (!Number.isFinite(distance) || distance > MAX_SOUND_DISTANCE) {
            drop(`reported ${distance.toFixed(1)} away`);
            return;
        }

        // The sound carries its own position, so it is played from there rather than from the
        // player, and only as far as a sound should carry. The sender is left out: the client
        // that sent this has already played it locally, and echoing it back played everything
        // twice for whoever made the noise. Replication sends it when the tick seals, rebuilt
        // from the fields the client sent, which is what the relay always carried.
        session.getWorld().relaySound({
            sender: session.runtimeId,
            x: packet.positionX,
            y: packet.positionY,
            z: packet.positionZ,
            sound: packet.sound,
            data: packet.extraData,
            type: packet.entityType,
            baby: packet.isBabyMob,
            global: packet.disableRelativeVolume,
            actor: packet.entityUniqueId,
            firedAt:
                packet.fireAtPosition === null
                    ? null
                    : {
                          x: packet.fireAtPosition.getX(),
                          y: packet.fireAtPosition.getY(),
                          z: packet.fireAtPosition.getZ()
                      }
        });
    }
}
