/**
 * Verifies a behavior pack script's form reaches the client and the client's answer reaches the
 * script: `/weather thunder` makes the script show an `ActionFormData`, the client renders it,
 * the scenario clicks its second button, and the script's `show()` promise settles with selection
 * 1, which the script puts in the player's chat.
 */
import assert from 'node:assert/strict';

import { NATIVE_BUILD_PLATFORMS } from '../../../../packages/script-host/src/platform.ts';
import { SCRIPT_FORM_MESSAGE, SCRIPT_FORM_TITLE } from '../jsp-server.mts';
import type { Scenario } from '../scenario.mts';
import { sleep } from '../scenario.mts';

/** What the server logs when it cannot load the script host, and so runs no scripts. */
const NO_SCRIPT_HOST =
    /behavior pack\(s\) have scripts, but @jsprismarine\/script-host (is not installed|has no library)/;

/** One input target of the form the client shows, as its `state` reports it. */
interface FormHit {
    readonly kind?: unknown;
    readonly index?: unknown;
    readonly rect?: unknown;
}

/** The centre of the form's second button, in window coordinates, or undefined until it is drawn. */
const secondButton = (form: unknown): [number, number] | undefined => {
    if (typeof form !== 'object' || form === null || !('hits' in form) || !Array.isArray(form.hits)) return undefined;
    const buttons = form.hits.filter((hit: FormHit) => /button/i.test(String(hit.kind)));
    const hit: FormHit | undefined = buttons.find((each: FormHit) => each.index === 1) ?? buttons[1];
    const rect = hit?.rect;
    if (!Array.isArray(rect)) return undefined;
    const [x, y, width, height] = rect;
    if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') {
        return undefined;
    }
    return [x + width / 2, y + height / 2];
};

export const scriptForm: Scenario = {
    name: 'script-form',
    description:
        "a behavior pack script's ActionFormData shows on the client, and the button the player clicks settles the script's show()",
    run: async ({ client, server, log }) => {
        // The script host builds on Linux only for now (issue #3215), as script-world-message says.
        if (!NATIVE_BUILD_PLATFORMS.includes(process.platform)) {
            log(`skipped: the script host has no build for ${process.platform}, so the server runs no scripts`);
            return;
        }
        const unloaded = server.lines.find((line) => NO_SCRIPT_HOST.test(line));
        assert.equal(unloaded, undefined, `the server could not load the script host: ${unloaded}`);

        server.command('weather thunder');
        try {
            let target: [number, number] | undefined;
            const shown = Date.now() + 15_000;
            for (;;) {
                const { form } = await client.state();
                const title = typeof form === 'object' && form !== null && 'title' in form ? String(form.title) : '';
                if (title.includes(SCRIPT_FORM_TITLE)) target = secondButton(form);
                if (target !== undefined) break;
                assert.ok(
                    Date.now() < shown,
                    `the client never showed the script's form; form: ${JSON.stringify(form)}`
                );
                await sleep(250);
            }
            log(`the form is open; clicking its second button at ${target.join(', ')}`);
            await client.clickAt(target);

            const expected = `${SCRIPT_FORM_MESSAGE}1`;
            const answered = Date.now() + 15_000;
            for (;;) {
                const { chat } = await client.state();
                const lines = Array.isArray(chat) ? chat.map(String) : [];
                if (lines.some((line) => line.includes(expected))) break;
                assert.ok(Date.now() < answered, `chat never showed "${expected}"; chat: ${JSON.stringify(chat)}`);
                await sleep(250);
            }
            log(`chat showed "${expected}"`);
        } finally {
            server.command('weather clear');
        }
    }
};
