// @module-tag integration

/**
 * The scoreboard as a joined player sees it: an objective counting a statistic the server raises
 * each tick, shown in the sidebar, and drawn again for a player who comes back.
 */
import { SetDisplayObjectivePacket, SetScorePacket } from '@jsprismarine/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DecodedPacket } from '../net/ClientPacketRegistry';
import type { LoopbackPlayer, LoopbackServer } from '../testing/loopbackServer.test-utils';
import { startLoopbackServer } from '../testing/loopbackServer.test-utils';

let jsp: LoopbackServer;

// Booting the server builds its content, the slow part, so it happens once for the file.
beforeAll(async () => {
    jsp = await startLoopbackServer({ name: 'scoreboard-scenarios' });
}, 300_000);

afterAll(async () => {
    await jsp?.close();
}, 60_000);

/** What one client was shown of the scoreboard. */
interface Shown {
    readonly player: LoopbackPlayer;
    /** Each slot's objective, as the last `SetDisplayObjective` for it left it. */
    readonly slots: Map<string, string>;
    /** The scores, by objective and holder, as the last `SetScore` for each left them. */
    readonly scores: Map<string, number>;
}

/** Joins a client that records the scoreboard packets it is sent, from the first one of its join. */
const joinWatching = async (name: string): Promise<Shown> => {
    const { player, joined } = jsp.connect(name);
    const registry = player.client.getRegistry();
    for (const packet of [SetDisplayObjectivePacket, SetScorePacket]) {
        if (!registry.has(new packet().getId())) registry.register(packet);
    }
    const slots = new Map<string, string>();
    const scores = new Map<string, number>();
    player.client.on('packet', ({ packet }: DecodedPacket) => {
        if (packet instanceof SetDisplayObjectivePacket) slots.set(packet.displaySlotName, packet.objectiveName);
        if (packet instanceof SetScorePacket) {
            for (const entry of packet.entries) {
                const key = `${entry.objectiveName}/${'fakePlayerName' in entry ? entry.fakePlayerName : ''}`;
                if ('scoreValue' in entry) scores.set(key, entry.scoreValue);
            }
        }
    });
    let done = false;
    void joined.finally(() => {
        done = true;
    });
    await jsp.until(() => done, `${name} never joined`, 120);
    await joined;
    return { player, slots, scores };
};

describe('scoreboard-play-time', () => {
    it('counts a player’s play time in the sidebar, and shows it again when they rejoin', async () => {
        const first = await joinWatching('Timer');

        const added = await jsp.command('scoreboard objectives add play_time minecraft.custom:minecraft.play_time');
        expect(added.ran).toBe(true);
        await jsp.command('scoreboard objectives setdisplay sidebar play_time');

        await jsp.until(() => first.slots.get('sidebar') === 'play_time', 'the sidebar never showed play_time');
        await jsp.until(() => (first.scores.get('play_time/Timer') ?? 0) >= 5, 'the play time never counted up');
        const counted = first.scores.get('play_time/Timer')!;

        first.player.leave();
        await jsp.tick();
        await jsp.until(() => jsp.server.getSessionManager().getSessions().length === 0, 'Timer never left');

        const second = await joinWatching('Timer');
        await jsp.until(() => second.slots.get('sidebar') === 'play_time', 'the rejoined sidebar was empty');
        await jsp.until(
            () => (second.scores.get('play_time/Timer') ?? 0) > counted,
            'the rejoined player’s play time did not go on from where it was'
        );
        second.player.leave();
        await jsp.tick();
    });

    it('refuses a criterion Java does not know', async () => {
        const { messages } = await jsp.command('scoreboard objectives add nonsense minecraft.custom:minecraft.nothing');
        await jsp.tick();

        expect(messages.join('\n')).toMatch(/Syntax error: .*minecraft\.custom:minecraft\.nothing/);
        const { messages: listed } = await jsp.command('scoreboard objectives list');
        expect(listed.join('\n')).not.toContain('nonsense');
    });
});
