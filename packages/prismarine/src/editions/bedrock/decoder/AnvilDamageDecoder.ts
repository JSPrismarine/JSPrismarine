import type AnvilDamagePacket from '@jsprismarine/protocol/bedrock/packet/AnvilDamagePacket';
import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';

import type { Intent } from '../../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/** An anvil screen's request to wear its anvil down, which a Java client leaves to the server. */
export default class AnvilDamageDecoder implements PacketDecoder<AnvilDamagePacket, 'damageAnvil'> {
    public static readonly PacketName = 'AnvilDamagePacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['damageAnvil'] as const;

    /** Decodes the anvil's position. */
    public decode(packet: AnvilDamagePacket, _view: DecodeView): readonly Intent<'damageAnvil'>[] {
        const data = packet.getPacketData();
        if (data === null) throw new PrismarineNetworkErrors.AnvilDamageNotDecoded();
        const { x, y, z } = data.blockPosition;
        return [{ kind: 'damageAnvil', position: { x, y, z } }];
    }
}
