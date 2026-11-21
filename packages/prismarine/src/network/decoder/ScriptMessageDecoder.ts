import type ScriptMessagePacket from '@jsprismarine/protocol/bedrock/packet/ScriptMessagePacket';
import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';

import type { Intent } from '../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/** A message from a client's scripts to the server's. */
export default class ScriptMessageDecoder implements PacketDecoder<ScriptMessagePacket, 'scriptMessage'> {
    public static readonly PacketName = 'ScriptMessagePacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['scriptMessage'] as const;

    /** Decodes the message id and value. */
    public decode(packet: ScriptMessagePacket, _view: DecodeView): readonly Intent<'scriptMessage'>[] {
        const data = packet.getPacketData();
        if (data === null) throw new PrismarineNetworkErrors.ScriptMessageNotDecoded();
        return [{ kind: 'scriptMessage', id: data.messageId, value: data.messageValue }];
    }
}
