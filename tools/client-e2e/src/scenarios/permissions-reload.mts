/**
 * Verifies a connected player's permissions follow `permissions.json` without a rejoin: a grant
 * through `/perms` lets the player run `/tell`, a revocation made in the file and read back with
 * `/perms reload` takes it away, and a grant with an expiry stops at its instant.
 *
 * What the client observes is the server's answer to the command it sends: the whisper when the
 * command runs, and the refusal when it does not. cinnabar's state exposes no command list or
 * abilities, so the list the server sends is checked in the unit tests and the answer here.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { parseConfigDocument } from '../../../../packages/prismarine/src/config/ConfigDocument.ts';
import type { Scenario, ScenarioContext } from '../scenario.mts';
import { sleep } from '../scenario.mts';

/** What the server answers a player who lacks the command's node. */
const REFUSED = 'do not have permission';
/** The node `/tell` needs, which a fresh file grants no player. */
const NODE = 'minecraft.command.tell';

/** Sends a line and waits until the client's chat shows a line matching `expected`. */
const chatShows = async (
    { client, server }: Pick<ScenarioContext, 'client' | 'server'>,
    line: string,
    expected: string
): Promise<void> => {
    const before = ((await client.state()).chat as unknown[] | undefined)?.length ?? 0;
    await client.chat(line);
    const deadline = Date.now() + 15_000;
    for (;;) {
        const { chat } = await client.state();
        const lines = Array.isArray(chat) ? chat.slice(before).map(String) : [];
        if (lines.some((shown) => shown.includes(expected))) return;
        assert.ok(
            Date.now() < deadline,
            `chat never showed "${expected}" after "${line}"; new chat: ${JSON.stringify(lines)}; server: ${server.lines.slice(-5).join(' | ')}`
        );
        await sleep(250);
    }
};

/** Runs a `/perms` line on the console and waits for its answer. */
const perms = async (server: ScenarioContext['server'], line: string, answer: RegExp): Promise<void> => {
    const reply = server.waitForLine(answer, 10_000);
    server.command(`perms ${line}`);
    await reply;
};

export const permissionsReload: Scenario = {
    name: 'permissions-reload',
    description:
        "a connected player's permissions follow a /perms grant, a file edit read back by /perms reload, and an expiry, without rejoining",
    run: async (context) => {
        const { client, server, playerName, log } = context;
        const marker = `e2e-perms-${Date.now()}`;
        const whisper = `/tell ${playerName} ${marker}`;

        await chatShows(context, whisper, REFUSED);
        log('a fresh file refuses /tell');

        await perms(server, `user ${playerName} permission set ${NODE}`, /Set minecraft\.command\.tell for/);
        await chatShows(context, whisper, marker);
        log('the grant through /perms lets the player whisper');

        // An owner's editor takes the node out of the record; the server reads the file again.
        const file = path.join(server.dir, 'permissions.json');
        const document = parseConfigDocument(fs.readFileSync(file, 'utf8'));
        document.set(['users', 'offline', playerName, 'nodes'], []);
        fs.writeFileSync(file, document.toString());
        await perms(server, 'reload', /Reloaded permissions\.json/);
        await chatShows(context, whisper, REFUSED);
        log('the revocation in the file took effect after /perms reload');

        await perms(server, `user ${playerName} permission set ${NODE} 3s`, /Set minecraft\.command\.tell for/);
        await chatShows(context, `${whisper}-timed`, `${marker}-timed`);
        // The expiry is an instant on the server's clock, so the wait is wall-clock time.
        await sleep(3_500);
        await chatShows(context, whisper, REFUSED);
        log('the timed grant ended at its instant');
        await client.screenshot(path.join(context.artifacts, 'permissions-reload.png'));
    }
};
