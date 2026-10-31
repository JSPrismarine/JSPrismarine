import BossEventPacket, {
    BossBarColor,
    BossBarOverlay,
    BossEventUpdateType
} from '@jsprismarine/protocol/packet/BossEventPacket';
import { describe, expect, it } from 'vitest';

import { fakePlayer } from '../../testing/fakePlayer.test.helper';
import { BossBar } from '../BossBar';
import BossEventHandler from './BossEventHandler';

/** The boss events among everything a fake connection captured, in send order. */
const bossEvents = (sent: unknown[]) => sent.filter((packet) => packet instanceof BossEventPacket);

/** A serverbound boss event asking about `targetActorId`. */
const query = (targetActorId: bigint, eventType = BossEventUpdateType.Query) =>
    Object.assign(new BossEventPacket(), { targetActorId, eventType });

describe('BossEventHandler', () => {
    it('answers a Query with an Add carrying the bar state the player already has', async () => {
        const { player, server, sent } = fakePlayer();
        const bar = new BossBar({
            actorUniqueId: 42n,
            name: 'Ender Dragon',
            color: BossBarColor.Red,
            overlay: BossBarOverlay.Notched10
        });
        await bar.setPercent(0.5);
        await bar.addPlayer(player);
        sent.length = 0;

        await new BossEventHandler().handle(query(42n), server, player.getNetworkSession());

        const events = bossEvents(sent);
        expect(events).toHaveLength(1);
        expect(events[0]?.eventType).toBe(BossEventUpdateType.Add);
        expect(events[0]?.targetActorId).toBe(42n);
        expect(events[0]?.name).toBe('Ender Dragon');
        expect(events[0]?.healthPercent).toBe(0.5);
        expect(events[0]?.color).toBe(BossBarColor.Red);
        expect(events[0]?.overlay).toBe(BossBarOverlay.Notched10);
    });

    it('leaves a Query about an actor with no bar for that player unanswered', async () => {
        const { player, server, sent } = fakePlayer();
        const bar = new BossBar({ actorUniqueId: 42n, name: 'Ender Dragon' });
        await bar.addPlayer(player);
        sent.length = 0;

        await new BossEventHandler().handle(query(7n), server, player.getNetworkSession());

        expect(bossEvents(sent)).toHaveLength(0);
    });

    it('ignores a serverbound event that is not a Query', async () => {
        const { player, server, sent } = fakePlayer();
        const bar = new BossBar({ actorUniqueId: 42n, name: 'Ender Dragon' });
        await bar.addPlayer(player);
        sent.length = 0;

        await new BossEventHandler().handle(query(42n, BossEventUpdateType.Remove), server, player.getNetworkSession());

        expect(bossEvents(sent)).toHaveLength(0);
    });
});
