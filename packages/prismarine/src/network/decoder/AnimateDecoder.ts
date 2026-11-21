import type AnimatePacket from '@jsprismarine/protocol/bedrock/packet/AnimatePacket';
import { AnimateAction } from '@jsprismarine/protocol/bedrock/packet/AnimatePacket';

import type { Intent, PlayerAnimation } from '../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/**
 * The animations a client plays on itself and asks to have shown to everyone else, by Bedrock's
 * action code. `NoAction` animates nothing, and a byte outside the enum is not a 2193 client's
 * doing, so neither is here.
 */
const ANIMATION_OF: ReadonlyMap<number, PlayerAnimation> = new Map([
    [AnimateAction.Swing, 'swing'],
    [AnimateAction.WakeUp, 'wakeUp'],
    [AnimateAction.CriticalHit, 'criticalHit'],
    [AnimateAction.MagicCriticalHit, 'magicCriticalHit']
]);

/**
 * A client's animation of itself.
 *
 * A packet naming another actor, or an action no client sends, is logged at debug level and
 * dropped: a client animates itself, and relaying it as anyone else would let one player make
 * another swing.
 */
export default class AnimateDecoder implements PacketDecoder<AnimatePacket, 'animate'> {
    public static readonly PacketName = 'AnimatePacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['animate'] as const;

    /** Decodes one animation, keeping the data and swing source the client sent. */
    public decode(packet: AnimatePacket, view: DecodeView): readonly Intent<'animate'>[] {
        if (packet.runtimeEntityId !== view.runtimeId) {
            view.log.debug(
                `Dropped animation ${packet.action} from ${view.name}: it names actor ${packet.runtimeEntityId}, not themselves`
            );
            return [];
        }

        const animation = ANIMATION_OF.get(packet.action);
        if (animation === undefined) {
            view.log.debug(`Dropped animation ${packet.action} from ${view.name}: not one a client sends`);
            return [];
        }

        return [{ kind: 'animate', animation, data: packet.data, swingSource: packet.swingSource }];
    }
}
