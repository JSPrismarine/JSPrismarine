import BossEventPacket, {
    BossBarColor,
    BossBarOverlay,
    BossEventUpdateType
} from '@jsprismarine/protocol/packet/BossEventPacket';
import { describe, expect, it } from 'vitest';

import { fakePlayer } from '../testing/fakePlayer.test.helper';
import { BossBar } from './BossBar';

/** The boss events among everything a fake connection captured, in send order. */
const bossEvents = (sent: unknown[]) => sent.filter((packet) => packet instanceof BossEventPacket);

/** A dragon-shaped bar with no default left in place, so every asserted field is deliberate. */
const dragonBar = () =>
    new BossBar({
        actorUniqueId: 42n,
        name: 'Ender Dragon',
        color: BossBarColor.Red,
        overlay: BossBarOverlay.Notched10
    });

describe('BossBar', () => {
    it('shows the bar on addPlayer with its actor, title, percent, color and overlay', async () => {
        const { player, sent } = fakePlayer();
        const bar = dragonBar();

        await bar.setPercent(0.5);
        await bar.addPlayer(player);

        const events = bossEvents(sent);
        expect(events).toHaveLength(1);
        expect(events[0]?.eventType).toBe(BossEventUpdateType.Add);
        expect(events[0]?.targetActorId).toBe(42n);
        expect(events[0]?.name).toBe('Ender Dragon');
        expect(events[0]?.filteredName).toBe('');
        expect(events[0]?.healthPercent).toBe(0.5);
        expect(events[0]?.color).toBe(BossBarColor.Red);
        expect(events[0]?.overlay).toBe(BossBarOverlay.Notched10);
        expect(bar.players()).toEqual([player]);
    });

    it('sends UpdatePercent, clamped to 0..1, only to added players', async () => {
        const added = fakePlayer();
        const bystander = fakePlayer();
        const bar = dragonBar();
        await bar.addPlayer(added.player);
        added.sent.length = 0;

        await bar.setPercent(2);
        await bar.setPercent(-3);

        const events = bossEvents(added.sent);
        expect(events.map((event) => event.eventType)).toEqual([
            BossEventUpdateType.UpdatePercent,
            BossEventUpdateType.UpdatePercent
        ]);
        expect(events.map((event) => event.healthPercent)).toEqual([1, 0]);
        // The flat layout carries every field on every event.
        expect(events[0]?.targetActorId).toBe(42n);
        expect(events[0]?.name).toBe('Ender Dragon');
        expect(events[0]?.color).toBe(BossBarColor.Red);
        expect(events[0]?.overlay).toBe(BossBarOverlay.Notched10);
        expect(bossEvents(bystander.sent)).toHaveLength(0);
    });

    it('sends UpdateName with the new title', async () => {
        const { player, sent } = fakePlayer();
        const bar = dragonBar();
        await bar.addPlayer(player);
        sent.length = 0;

        await bar.setName('Dragon, enraged');

        const events = bossEvents(sent);
        expect(events).toHaveLength(1);
        expect(events[0]?.eventType).toBe(BossEventUpdateType.UpdateName);
        expect(events[0]?.name).toBe('Dragon, enraged');
        expect(events[0]?.targetActorId).toBe(42n);
    });

    it('hides the bar on removePlayer and stops updating that player', async () => {
        const { player, sent } = fakePlayer();
        const bar = dragonBar();
        await bar.addPlayer(player);
        sent.length = 0;

        await bar.removePlayer(player);
        await bar.setPercent(0.25);

        const events = bossEvents(sent);
        expect(events).toHaveLength(1);
        expect(events[0]?.eventType).toBe(BossEventUpdateType.Remove);
        expect(events[0]?.targetActorId).toBe(42n);
        expect(bar.players()).toEqual([]);
    });

    it('drops a player who disconnects', async () => {
        const { player, sent } = fakePlayer();
        const bar = dragonBar();
        await bar.addPlayer(player);
        sent.length = 0;

        await player.disable();
        await bar.setPercent(0.25);

        expect(bossEvents(sent)).toHaveLength(0);
        expect(bar.players()).toEqual([]);
    });

    it('moves the bar to a new actor with a Remove for the old id and an Add for the new', async () => {
        const { player, sent } = fakePlayer();
        const bar = dragonBar();
        await bar.setPercent(0.5);
        await bar.addPlayer(player);
        sent.length = 0;

        await bar.setActorUniqueId(99n);
        await bar.setPercent(0.25);

        const events = bossEvents(sent);
        expect(events.map((event) => [event.eventType, event.targetActorId])).toEqual([
            [BossEventUpdateType.Remove, 42n],
            [BossEventUpdateType.Add, 99n],
            [BossEventUpdateType.UpdatePercent, 99n]
        ]);
        expect(events[1]?.name).toBe('Ender Dragon');
        expect(events[1]?.healthPercent).toBe(0.5);
    });
});
