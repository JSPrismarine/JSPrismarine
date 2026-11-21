import type SetDefaultGameTypePacket from '@jsprismarine/protocol/bedrock/packet/SetDefaultGameTypePacket';

import type { Intent } from '../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/** The default game type a client picked from the world settings screen, as it came. */
export default class SetDefaultGameTypeDecoder implements PacketDecoder<
    SetDefaultGameTypePacket,
    'setDefaultGameMode'
> {
    public static readonly PacketName = 'SetDefaultGameTypePacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['setDefaultGameMode'] as const;

    /** Decodes the requested default; the handler decides whether the sender may and the server can hold it. */
    public decode(packet: SetDefaultGameTypePacket, _view: DecodeView): readonly Intent<'setDefaultGameMode'>[] {
        return [{ kind: 'setDefaultGameMode', gamemode: packet.gamemode }];
    }
}
