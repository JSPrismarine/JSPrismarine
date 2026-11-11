import type BossEventPacket from '@jsprismarine/protocol/packet/BossEventPacket';
import { BossEventUpdateType } from '@jsprismarine/protocol/packet/BossEventPacket';

import { BossBar } from '../BossBar';
import type { SessionContext } from './HandlerContext';
import type { ReadLaneHandler } from './SessionHandler';

/**
 * The client asking about a boss bar it has on screen.
 *
 * The only serverbound boss event is `Query`; it is answered with an Add replaying the bar
 * bound to the queried actor for the asking player. Anything else from the client, and a query
 * about an actor the player has no bar for, is dropped.
 */
export default class BossEventHandler implements ReadLaneHandler<BossEventPacket> {
    public static PacketName = 'BossEventPacket';
    public readonly takes = 'context';
    public readonly phases = ['play'] as const;
    public readonly lane = 'read';

    /** Replays the queried bar's Add to the asking player. */
    public async handle(packet: BossEventPacket, { session }: SessionContext): Promise<void> {
        if (packet.eventType !== BossEventUpdateType.Query) return;

        await BossBar.answerQuery(session, packet.targetActorId);
    }
}
