import type InteractPacket from '@jsprismarine/protocol/bedrock/packet/InteractPacket';
import { InteractAction } from '@jsprismarine/protocol/bedrock/packet/InteractPacket';

import type { Intent } from '../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/**
 * What a client did to an actor, or that it pressed the inventory button.
 *
 * `OpenInventory` has to name the sender's own runtime id, which is what a client sends and what
 * PocketMine checks; a packet naming anyone else is dropped. `NpcOpen` has to name an actor the
 * client has been shown; whether it is within reach is the world's to say, so the intent handler
 * checks that. `InteractUpdate` arrives every time the crosshair crosses an actor, and
 * `StopRiding` has no vehicles to leave, so both decode to nothing without a log line. A value no
 * client sends is logged and dropped.
 */
export default class InteractDecoder implements PacketDecoder<InteractPacket, 'openInventory' | 'openNpc'> {
    public static readonly PacketName = 'InteractPacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['openInventory', 'openNpc'] as const;

    /** Decodes one interaction. */
    public decode(packet: InteractPacket, view: DecodeView): readonly Intent<'openInventory' | 'openNpc'>[] {
        switch (packet.action) {
            case InteractAction.StopRiding:
            case InteractAction.InteractUpdate:
                return [];

            case InteractAction.OpenInventory:
                if (packet.target !== view.runtimeId) {
                    view.log.debug(
                        `Dropped an inventory open from ${view.name}: it names actor ${packet.target}, not themselves`
                    );
                    return [];
                }
                return [{ kind: 'openInventory' }];

            case InteractAction.NpcOpen:
                if (!view.tracks(packet.target)) {
                    view.log.debug(
                        `Dropped an NPC open from ${view.name}: actor ${packet.target} is not one they have been shown`
                    );
                    return [];
                }
                return [{ kind: 'openNpc', target: packet.target }];

            default:
                view.log.verbose(`Dropped interact action ${packet.action} from ${view.name}: not one a client sends`);
                return [];
        }
    }
}
