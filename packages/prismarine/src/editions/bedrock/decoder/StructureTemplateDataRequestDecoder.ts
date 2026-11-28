import type StructureTemplateDataRequestPacket from '@jsprismarine/protocol/bedrock/packet/StructureTemplateDataRequestPacket';
import { StructureTemplateRequestOperation } from '@jsprismarine/protocol/bedrock/packet/StructureTemplateDataRequestPacket';
import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';

import type { Intent } from '../../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/** A structure block asking for a structure's data, which Mojang's docs say the server switches off. */
export default class StructureTemplateDataRequestDecoder implements PacketDecoder<
    StructureTemplateDataRequestPacket,
    'useStructureBlock'
> {
    public static readonly PacketName = 'StructureTemplateDataRequestPacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['useStructureBlock'] as const;

    /** Decodes the block's position, the structure's name and the operation, by its name or number. */
    public decode(
        packet: StructureTemplateDataRequestPacket,
        _view: DecodeView
    ): readonly Intent<'useStructureBlock'>[] {
        const data = packet.getPacketData();
        if (data === null) throw new PrismarineNetworkErrors.StructureTemplateRequestNotDecoded();
        const { x, y, z } = data.structurePosition;
        return [
            {
                kind: 'useStructureBlock',
                position: { x, y, z },
                structure: data.structureName,
                operation: StructureTemplateRequestOperation[data.requestedOperation] ?? String(data.requestedOperation)
            }
        ];
    }
}
