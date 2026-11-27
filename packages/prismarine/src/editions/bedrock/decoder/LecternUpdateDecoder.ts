import type LecternUpdatePacket from '@jsprismarine/protocol/bedrock/packet/LecternUpdatePacket';
import { PrismarineNetworkErrors } from '@jsprismarine/errors/prismarine/network';

import type { Intent } from '../../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/** A page turn on a lectern's screen. */
export default class LecternUpdateDecoder implements PacketDecoder<LecternUpdatePacket, 'turnLecternPage'> {
    public static readonly PacketName = 'LecternUpdatePacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['turnLecternPage'] as const;

    /** Decodes the lectern's position and the page it was turned to. */
    public decode(packet: LecternUpdatePacket, _view: DecodeView): readonly Intent<'turnLecternPage'>[] {
        const data = packet.getPacketData();
        if (data === null) throw new PrismarineNetworkErrors.LecternUpdateNotDecoded();
        const { x, y, z } = data.position;
        return [{ kind: 'turnLecternPage', position: { x, y, z }, page: data.newPage, totalPages: data.totalPages }];
    }
}
