import BossEventPacket, {
    BossBarColor,
    BossBarOverlay,
    BossEventUpdateType
} from '@jsprismarine/protocol/bedrock/packet/BossEventPacket';
import { describe, expect, it } from 'vitest';

import { BossBar } from '../../player/BossBar';
import { fakePlayer } from '../../testing/fakePlayer.test.helper';
import { sessionContext } from '../../testing/handlerContext.test.helper';
import QueryBossBarHandler from './QueryBossBarHandler';

/** The boss events among everything a fake connection captured, in send order. */
const bossEvents = (sent: unknown[]) => sent.filter((packet) => packet instanceof BossEventPacket);

describe('QueryBossBarHandler', () => {
    it('answers with an Add carrying the bar state the player already has', async () => {
        const { session, sent } = fakePlayer();
        const bar = new BossBar({
            actorUniqueId: 42n,
            name: 'Ender Dragon',
            color: BossBarColor.Red,
            overlay: BossBarOverlay.Notched10
        });
        await bar.setPercent(0.5);
        await bar.addPlayer(session);
        sent.length = 0;

        await new QueryBossBarHandler().handle({ kind: 'queryBossBar', actor: 42n }, sessionContext(session));

        const events = bossEvents(sent);
        expect(events).toHaveLength(1);
        expect(events[0]?.eventType).toBe(BossEventUpdateType.Add);
        expect(events[0]?.targetActorId).toBe(42n);
        expect(events[0]?.name).toBe('Ender Dragon');
        expect(events[0]?.healthPercent).toBe(0.5);
        expect(events[0]?.color).toBe(BossBarColor.Red);
        expect(events[0]?.overlay).toBe(BossBarOverlay.Notched10);
    });

    it('leaves a query about an actor with no bar for that player unanswered', async () => {
        const { session, sent } = fakePlayer();

        await new QueryBossBarHandler().handle({ kind: 'queryBossBar', actor: 99n }, sessionContext(session));

        expect(bossEvents(sent)).toEqual([]);
    });
});
