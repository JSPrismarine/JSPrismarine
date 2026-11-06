/** Verifies the client sees death, can respawn from the death screen, and returns to play. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { sleep, waitTicks } from '../scenario.mts';

/** Polls for a screen whose name contains `fragment`; returns its full name. */
const screenContaining = async (
    client: Parameters<Scenario['run']>[0]['client'],
    fragment: string
): Promise<string> => {
    const deadline = Date.now() + 15_000;
    for (;;) {
        const screens = (await client.state()).screens;
        const found = Array.isArray(screens)
            ? screens.find((screen): screen is string => typeof screen === 'string' && screen.includes(fragment))
            : undefined;
        if (found !== undefined) return found;
        assert.ok(Date.now() < deadline, `no ${fragment} screen appeared; stack: ${JSON.stringify(screens)}`);
        await sleep(250);
    }
};

export const deathRespawn: Scenario = {
    name: 'death-respawn',
    description: 'dying shows the death screen and respawning restores a healthy player',
    run: async ({ client, server, playerName, log }) => {
        server.command(`kill ${playerName}`);
        const deathScreen = await screenContaining(client, 'Death');

        // The death screen ignores clicks for a moment after it opens.
        await waitTicks(server, 30);
        await client.input({ pointer: [640, 510], press: ['MouseLeft'], press_frames: 3 });
        await client.input({ release_all: true });
        await client.waitForScreenAbsent(deathScreen, 15_000);
        await client.waitForScreenAbsent('Loading', 30_000);

        const deadline = Date.now() + 15_000;
        for (;;) {
            const health = (await client.state()).health as { current?: unknown } | undefined;
            if (typeof health?.current === 'number' && health.current > 0) {
                log(`respawned with ${health.current} health`);
                return;
            }
            assert.ok(
                Date.now() < deadline,
                `player never regained health after respawning: ${JSON.stringify(health)}`
            );
            await sleep(250);
        }
    }
};
