import { Vector3 } from '@jsprismarine/math';
import { LevelSoundEventName } from '@jsprismarine/minecraft';

import { CREATIVE_REACH } from '../../entity/Combat';
import type { InputContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/**
 * How far from the sender a client-sent sound may claim to have happened.
 *
 * Every sound a vanilla client reports is something it just did, such as a step, a block
 * placed, or a bow loosed, so all of them land within arm's length of it. The position is
 * taken from the intent and the sound is played to whoever is near that point, so without a
 * bound a client can make any noise in the game come out of any point in the world.
 * `CREATIVE_REACH` plus a block of slack is the furthest anything a player does reaches.
 */
const MAX_SOUND_DISTANCE = CREATIVE_REACH + 1;

/**
 * The player made a sound, which goes to the other players near where it happened.
 *
 * The decoder already checked who the sound is attributed to. This handler checks the world:
 * the sound has to be within reach of where the sender stands.
 */
export default class PlaySoundHandler implements IntentHandler<'playSound'> {
    public static readonly Kind = 'playSound';

    /**
     * Relays the sound from its own position, with every field the client sent. The sender is
     * left out: the client that sent this has already played it locally, and echoing it back
     * played everything twice for whoever made the noise. Replication sends it when the tick
     * seals.
     */
    public handle(intent: Intent<'playSound'>, { session, log }: InputContext): undefined {
        const position = new Vector3(intent.x, intent.y, intent.z);
        const distance = session.getPlayer().getPosition().distanceTo(position);
        if (!Number.isFinite(distance) || distance > MAX_SOUND_DISTANCE) {
            const sound = LevelSoundEventName[intent.sound] ?? intent.sound;
            log.verbose(`Dropped sound ${sound} from ${session.identity.name}: reported ${distance.toFixed(1)} away`);
            return;
        }

        session.getWorld().relaySound({
            sender: session.runtimeId,
            x: intent.x,
            y: intent.y,
            z: intent.z,
            sound: intent.sound,
            data: intent.data,
            type: intent.type,
            baby: intent.baby,
            global: intent.global,
            actor: intent.actor,
            firedAt: intent.firedAt
        });
    }
}
