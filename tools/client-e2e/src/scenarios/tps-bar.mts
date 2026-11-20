/**
 * Verifies the TPS bar addon end to end: installed as a world pack, an operator runs `/tpsbar`,
 * the client shows the boss bar the pack draws and keeps it through the pack's redraws, and a
 * second `/tpsbar` takes it down.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import { isPublishedPlatform, platformKey } from '../../../../packages/script-host/src/platform.ts';
import type { CinnabarClient } from '../client.mts';
import type { Scenario } from '../scenario.mts';
import { untilTicks, waitTicks } from '../scenario.mts';

/** The client's log line for a boss bar it starts or stops showing, with the action. */
const BOSS_LIFECYCLE = /boss lifecycle received.*action=(Show|Hide).*applied=(true|false)/;
/** The client's log line for bars it dropped because it tracks no actor they are bound to. */
const BOSS_RETIRED = /boss bars retired after actor lifetime ended/;

/** Where the client logs boss bars, at the info level its default filter leaves out. */
const BOSS_LOG = 'client_ui::ui_runtime::boss=info';

/** The boss bar lines the client has logged, in order, without their colors. */
const bossLines = (client: CinnabarClient): string[] =>
    stripVTControlCharacters(client.output())
        .split('\n')
        .filter((line) => BOSS_LIFECYCLE.test(line) || BOSS_RETIRED.test(line));

/** Whether the player's chat shows `text`. */
const chatShows = async (client: CinnabarClient, text: string): Promise<boolean> => {
    const { chat } = await client.state();
    return Array.isArray(chat) && chat.map(String).some((line) => line.includes(text));
};

export const tpsBar: Scenario = {
    name: 'tps-bar',
    description:
        'an operator runs /tpsbar from the TPS bar addon and the client shows its boss bar until /tpsbar again',
    serverOptions: { addons: ['tps-bar'] },
    run: async ({ client, server, playerName, artifacts, log }) => {
        // A platform without a published script host build runs no scripts, as script-world-message says.
        if (!isPublishedPlatform()) {
            log(`skipped: the script host has no build for ${platformKey()}, so the server runs no scripts`);
            return;
        }
        // Adds to the filter the runner set, which `JSP_E2E_CLIENT_LOG` names.
        const runnerLog = process.env.JSP_E2E_CLIENT_LOG ?? '';
        await client.call('log_filter_set', { spec: [runnerLog, BOSS_LOG].filter(Boolean).join(',') });
        server.command(`op ${playerName}`);
        await waitTicks(server, 10);
        const before = bossLines(client).length;

        await client.chat('/tpsbar');
        assert.ok(
            await untilTicks(server, 100, () => chatShows(client, 'TPS bar on.')),
            '/tpsbar never answered "TPS bar on."'
        );
        assert.ok(
            await untilTicks(server, 100, async () =>
                bossLines(client)
                    .slice(before)
                    .some((line) => /action=Show.*applied=true/.test(line))
            ),
            `the client never showed a boss bar; its boss lines: ${JSON.stringify(bossLines(client).slice(before))}`
        );
        // Two redraws, so the bar has been updated in place, then a look at it.
        await waitTicks(server, 45);
        const shown = bossLines(client).slice(before);
        assert.deepEqual(
            shown.filter((line) => BOSS_RETIRED.test(line) || /action=Hide/.test(line)),
            [],
            `the client dropped the bar after showing it: ${JSON.stringify(shown)}`
        );
        await client.screenshot(path.join(artifacts, 'tps-bar.png'));
        log('the client shows the TPS bar');

        const shownCount = bossLines(client).length;
        await client.chat('/tpsbar');
        assert.ok(
            await untilTicks(server, 100, () => chatShows(client, 'TPS bar off.')),
            'the second /tpsbar never answered "TPS bar off."'
        );
        assert.ok(
            await untilTicks(server, 100, async () =>
                bossLines(client)
                    .slice(shownCount)
                    .some((line) => /action=Hide.*applied=true/.test(line))
            ),
            `the client never took the boss bar down; its boss lines: ${JSON.stringify(bossLines(client).slice(shownCount))}`
        );
        log('the client took the TPS bar down');
        await client.call('log_filter_set', { spec: runnerLog });
    }
};
