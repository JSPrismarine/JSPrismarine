import type BlockPickRequestPacket from '@jsprismarine/protocol/bedrock/packet/BlockPickRequestPacket';
import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';

import type { Intent } from '../../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/**
 * A block pick. `Max Slots`, the client's count of empty hotbar slots, is left out: the server
 * decides where a picked item goes from the inventory it holds.
 */
export default class BlockPickRequestDecoder implements PacketDecoder<BlockPickRequestPacket, 'pickBlock'> {
    public static readonly PacketName = 'BlockPickRequestPacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['pickBlock'] as const;

    /** Decodes the picked position and the data flag. */
    public decode(packet: BlockPickRequestPacket, _view: DecodeView): readonly Intent<'pickBlock'>[] {
        const data = packet.getPacketData();
        if (data === null) throw new PrismarineNetworkErrors.BlockPickRequestNotDecoded();
        const { x, y, z } = data.position;
        return [{ kind: 'pickBlock', position: { x, y, z }, withData: data.withData }];
    }
}
