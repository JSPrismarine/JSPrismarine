import type StructureBlockUpdatePacket from '@jsprismarine/protocol/bedrock/packet/StructureBlockUpdatePacket';
import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';

import type { Intent } from '../../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/** The settings a player left in a structure block's screen, of which the structure's name is kept. */
export default class StructureBlockUpdateDecoder implements PacketDecoder<
    StructureBlockUpdatePacket,
    'editStructureBlock'
> {
    public static readonly PacketName = 'StructureBlockUpdatePacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['editStructureBlock'] as const;

    /** Decodes the block's position and the structure's name. */
    public decode(packet: StructureBlockUpdatePacket, _view: DecodeView): readonly Intent<'editStructureBlock'>[] {
        const data = packet.getPacketData();
        if (data === null) throw new PrismarineNetworkErrors.StructureBlockUpdateNotDecoded();
        const { x, y, z } = data.blockPosition;
        return [
            {
                kind: 'editStructureBlock',
                position: { x, y, z },
                structure: data.structureData.structureName.unredacted
            }
        ];
    }
}
