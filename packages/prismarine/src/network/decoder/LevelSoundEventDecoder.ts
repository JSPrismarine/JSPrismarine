import { LevelSoundEventName } from '@jsprismarine/minecraft';
import type LevelSoundEventPacket from '@jsprismarine/protocol/bedrock/packet/LevelSoundEventPacket';

import { PLAYER_IDENTIFIER } from '../../entity/playerOverlay';
import type { Intent } from '../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/**
 * The `Actor Identifier` values a client sends for a sound with no actor of its own.
 *
 * An empty `ActorDefinitionIdentifier` renders as `:` on the wire, and some sounds carry the
 * empty string instead.
 */
const NO_ACTOR_TYPES = new Set(['', ':']);

/**
 * A sound a client reports having made.
 *
 * A client only knows about the sounds it started, so the actor it attributes the sound to is
 * itself or nobody; this server hands out the runtime id as the unique id, so the sender's own
 * is that. Whether the sound happened within reach of where the sender stands is a world
 * question, which the intent handler answers.
 */
export default class LevelSoundEventDecoder implements PacketDecoder<LevelSoundEventPacket, 'playSound'> {
    public static readonly PacketName = 'LevelSoundEventPacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['playSound'] as const;

    /** Decodes a sound the sender attributes to itself or to no actor, with every field it sent. */
    public decode(packet: LevelSoundEventPacket, view: DecodeView): readonly Intent<'playSound'>[] {
        const drop = (reason: string) => {
            const sound = LevelSoundEventName[packet.sound] ?? packet.sound;
            view.log.verbose(`Dropped sound ${sound} from ${view.name}: ${reason}`);
        };

        if (packet.entityUniqueId !== -1n && packet.entityUniqueId !== view.runtimeId) {
            drop(`attributed to actor ${packet.entityUniqueId}`);
            return [];
        }

        if (!NO_ACTOR_TYPES.has(packet.entityType) && packet.entityType !== PLAYER_IDENTIFIER) {
            drop(`attributed to a ${packet.entityType}`);
            return [];
        }

        return [
            {
                kind: 'playSound',
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
            }
        ];
    }
}
