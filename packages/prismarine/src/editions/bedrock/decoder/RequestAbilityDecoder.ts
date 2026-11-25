import { AbilityLayerFlag } from '@jsprismarine/minecraft';
import type RequestAbilityPacket from '@jsprismarine/protocol/bedrock/packet/RequestAbilityPacket';
import { RequestAbilityValueType } from '@jsprismarine/protocol/bedrock/packet/RequestAbilityPacket';

import type { Intent } from '../../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/**
 * A request to change one of the player's own abilities, named by the ability layer flag's name
 * and carrying the value the client sent in whichever type it chose.
 */
export default class RequestAbilityDecoder implements PacketDecoder<RequestAbilityPacket, 'requestAbility'> {
    public static readonly PacketName = 'RequestAbilityPacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['requestAbility'] as const;

    /** Decodes the ability and its value; the handler decides which abilities a client may set. */
    public decode(packet: RequestAbilityPacket, _view: DecodeView): readonly Intent<'requestAbility'>[] {
        const value =
            packet.valueType === RequestAbilityValueType.Bool
                ? packet.boolValue
                : packet.valueType === RequestAbilityValueType.Float
                  ? packet.floatValue
                  : null;
        return [{ kind: 'requestAbility', ability: AbilityLayerFlag[packet.ability] ?? String(packet.ability), value }];
    }
}
