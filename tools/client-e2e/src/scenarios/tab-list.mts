/**
 * Verifies the tab list addon end to end: installed as a world pack with the placeholders addon,
 * an operator sets a global template, the client commits the player list Remove and Add the
 * rename sends, `/tablist show` renders the template for the player, and `/tablist reset` gives
 * the entry its login name back.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import { isPublishedPlatform, platformKey } from '../../../../packages/script-host/src/platform.ts';
import { repoRoot } from '../cinnabar.mts';
import type { CinnabarClient } from '../client.mts';
import type { Scenario } from '../scenario.mts';
import { untilTicks, waitTicks } from '../scenario.mts';

/**
 * Whether the standard placeholders addon is in this checkout. It provides `{player:name}` and
 * `{player:ping}`; without it the tokens stay as written, and the scenario expects that text.
 */
const PLACEHOLDERS_ADDON = existsSync(path.join(repoRoot, 'addons', 'standard-placeholders'));

/** The client's log line for a player list update it applied, with how many players it lists after. */
const ROSTER = /Cinnabar world roster committed/;
/** Where the client logs the roster, at the debug level its default filter leaves out. */
const ROSTER_LOG = 'client_world::actor_store=debug';

/** How many players the client listed after each roster commit it has logged, in order. */
const rosterSizes = (client: CinnabarClient): number[] =>
    stripVTControlCharacters(client.output())
        .split('\n')
        .filter((line) => ROSTER.test(line))
        .map((line) => Number(/players=(\d+)/.exec(line)?.[1] ?? Number.NaN));

/** Whether the player's chat shows a line matching `pattern`. */
const chatShows = async (client: CinnabarClient, pattern: RegExp): Promise<boolean> => {
    const { chat } = await client.state();
    return Array.isArray(chat) && chat.map(String).some((line) => pattern.test(line));
};

/** Waits until the client has committed `count` more roster updates, and gives the sizes they left. */
const rosterCommits = async (
    client: CinnabarClient,
    server: Parameters<typeof untilTicks>[0],
    before: number,
    count: number
): Promise<number[]> => {
    const arrived = await untilTicks(server, 100, async () => rosterSizes(client).length >= before + count);
    const sizes = rosterSizes(client).slice(before);
    assert.ok(arrived, `the client committed ${sizes.length} roster updates, not ${count}: ${JSON.stringify(sizes)}`);
    return sizes;
};

export const tabList: Scenario = {
    name: 'tab-list',
    description:
        'an operator sets a tab list template and the client commits the player list Remove and Add that rename its entry',
    serverOptions: { addons: PLACEHOLDERS_ADDON ? ['standard-placeholders', 'tab-list'] : ['tab-list'] },
    run: async ({ client, server, playerName, artifacts, log }) => {
        // A platform without a published script host build runs no scripts, as script-world-message says.
        if (!isPublishedPlatform()) {
            log(`skipped: the script host has no build for ${platformKey()}, so the server runs no scripts`);
            return;
        }
        // Adds to the filter the runner set, which `JSP_E2E_CLIENT_LOG` names.
        const runnerLog = process.env.JSP_E2E_CLIENT_LOG ?? '';
        await client.call('log_filter_set', { spec: [runnerLog, ROSTER_LOG].filter(Boolean).join(',') });
        server.command(`op ${playerName}`);
        await waitTicks(server, 10);

        // Until a template is set, the list is untouched: no roster update arrives.
        const untouched = rosterSizes(client).length;
        await waitTicks(server, 45);
        assert.equal(
            rosterSizes(client).length,
            untouched,
            'the client committed a roster update before any template was set'
        );

        await client.chat('/tablist format "&a{player:name} &7{player:ping}ms"');
        assert.ok(
            await untilTicks(server, 100, () => chatShows(client, /Global template set\./)),
            '/tablist format never answered "Global template set."'
        );
        // The rename sends a Remove and then an Add for the one entry, so the list empties and fills again.
        const renamed = await rosterCommits(client, server, untouched, 2);
        assert.deepEqual(
            renamed.slice(0, 2),
            [0, 1],
            `the Remove and the Add did not leave an empty then a full list: ${JSON.stringify(renamed)}`
        );
        log('the client committed the Remove and the Add that rename the entry');

        await client.chat(`/tablist show ${playerName}`);
        const rendered = PLACEHOLDERS_ADDON
            ? new RegExp(`renders to: §a${playerName} §7\\d+ms`)
            : /renders to: §a\{player:name\} §7\{player:ping\}ms/;
        assert.ok(
            await untilTicks(server, 100, () => chatShows(client, rendered)),
            '/tablist show never printed the rendered entry'
        );
        log('the entry renders the template with the player name and ping');

        // A second render changes nothing while the ping holds, so no further update goes out for it alone.
        await client.input({ press: ['Escape'] });
        await client.waitFrames(10);
        await client.screenshot(path.join(artifacts, 'tab-list-pause-menu.png'));
        await client.input({ press: ['Escape'] });
        await client.waitFrames(5);

        const beforeReset = rosterSizes(client).length;
        await client.chat('/tablist reset');
        assert.ok(
            await untilTicks(server, 100, () => chatShows(client, /Global template cleared\./)),
            '/tablist reset never answered "Global template cleared."'
        );
        const restored = await rosterCommits(client, server, beforeReset, 2);
        assert.deepEqual(
            restored.slice(0, 2),
            [0, 1],
            `the reset did not send a Remove and an Add: ${JSON.stringify(restored)}`
        );
        log('the client committed the Remove and the Add that restore the login name');
        await client.call('log_filter_set', { spec: runnerLog });
    }
};
