import type SetPlayerInventoryOptionsPacket from '@jsprismarine/protocol/bedrock/packet/SetPlayerInventoryOptionsPacket';

import type { Intent } from '../../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/**
 * The inventory screen's layout, of which the crafting recipe book's filter is what both editions
 * keep. The tabs and the layouts are Bedrock's own and are left here.
 *
 * The packet is still read so that clicking a tab is silent: before the packet id was read as a
 * varint this arrived as 179 rather than 0x133 and was decoded as a ticking area status, which is
 * the error that led to reading it.
 */
export default class SetPlayerInventoryOptionsDecoder implements PacketDecoder<
    SetPlayerInventoryOptionsPacket,
    'setRecipeBook'
> {
    public static readonly PacketName = 'SetPlayerInventoryOptionsPacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['setRecipeBook'] as const;

    /** Decodes the crafting book's filter. */
    public decode(packet: SetPlayerInventoryOptionsPacket, _view: DecodeView): readonly Intent<'setRecipeBook'>[] {
        return [{ kind: 'setRecipeBook', book: 'crafting', open: null, filtering: packet.filtering }];
    }
}
