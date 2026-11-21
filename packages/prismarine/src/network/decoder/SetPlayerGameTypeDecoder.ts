import type SetPlayerGameTypePacket from '@jsprismarine/protocol/bedrock/packet/SetPlayerGameTypePacket';
import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';

import type { Intent } from '../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/** The game type a client picked from its dropdown, as it came; the handler decides whether it may. */
export default class SetPlayerGameTypeDecoder implements PacketDecoder<SetPlayerGameTypePacket, 'changeGameMode'> {
    public static readonly PacketName = 'SetPlayerGameTypePacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['changeGameMode'] as const;

    /** Decodes the requested game type. */
    public decode(packet: SetPlayerGameTypePacket, _view: DecodeView): readonly Intent<'changeGameMode'>[] {
        const data = packet.getPacketData();
        if (data === null) throw new PrismarineNetworkErrors.SetGameTypeNotDecoded();
        return [{ kind: 'changeGameMode', gamemode: data.gametype }];
    }
}
