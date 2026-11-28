import type LabTablePacket from '@jsprismarine/protocol/bedrock/packet/LabTablePacket';
import { LabTableType } from '@jsprismarine/protocol/bedrock/packet/LabTablePacket';
import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';

import type { Intent } from '../../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/** An Education Edition lab table action, which only Bedrock has. */
export default class LabTableDecoder implements PacketDecoder<LabTablePacket, 'useLabTable'> {
    public static readonly PacketName = 'LabTablePacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['useLabTable'] as const;

    /** Decodes the table's position and the action, by its name or, for one the docs do not list, its number. */
    public decode(packet: LabTablePacket, _view: DecodeView): readonly Intent<'useLabTable'>[] {
        const data = packet.getPacketData();
        if (data === null) throw new PrismarineNetworkErrors.LabTableNotDecoded();
        const { x, y, z } = data.position;
        return [{ kind: 'useLabTable', position: { x, y, z }, action: LabTableType[data.type] ?? String(data.type) }];
    }
}
