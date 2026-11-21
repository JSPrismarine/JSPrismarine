import type BossEventPacket from '@jsprismarine/protocol/bedrock/packet/BossEventPacket';
import { BossEventUpdateType } from '@jsprismarine/protocol/bedrock/packet/BossEventPacket';

import type { Intent } from '../../input/Intent';
import type { DecodeView } from './DecodeView';
import type { PacketDecoder } from './PacketDecoder';

/**
 * The client asking about a boss bar it has on screen.
 *
 * The only serverbound boss event is `Query`. Anything else from the client is dropped without
 * a log line, since the other update types are the server's to send.
 */
export default class BossEventDecoder implements PacketDecoder<BossEventPacket, 'queryBossBar'> {
    public static readonly PacketName = 'BossEventPacket';
    public readonly phases = ['play'] as const;
    public readonly intents = ['queryBossBar'] as const;

    /** Decodes a query into the bar it asks about. */
    public decode(packet: BossEventPacket, _view: DecodeView): readonly Intent<'queryBossBar'>[] {
        if (packet.eventType !== BossEventUpdateType.Query) return [];
        return [{ kind: 'queryBossBar', actor: packet.targetActorId }];
    }
}
