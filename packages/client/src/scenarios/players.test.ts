/**
 * What joined players see of the server's handling of logins, a frozen world, a script's player
 * record and permissions: the client e2e scenarios `duplicate-login`, `frozen-world`,
 * `player-properties` and `permissions-reload`, played over a loopback pipe against a server
 * stepped by hand.
 *
 * The server loads the cinnabar suite's visit counter, the one handler of its script pack these
 * scenarios use. A machine without the script host library runs no scripts, so
 * `player-properties` skips there unless `JSP_SCRIPT_HOST_REQUIRE=1` asks for a failure instead,
 * as CI does on Linux x64.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { TestContext } from 'vitest';

import type { LoopbackPlayer, LoopbackServer } from '../testing/loopbackServer.test-utils';
import { startLoopbackServer } from '../testing/loopbackServer.test-utils';
import { leaveAndWait, shownCount, wasShown } from './scenarioSupport.test-utils';

/** What the script tells a player at each first spawn of a login, followed by the count and the name. */
const VISITS_MESSAGE = 'client-e2e script: visit ';
/** The player dynamic property the script counts logins in. */
const VISITS_PROPERTY = 'e2e:visits';

const MANIFEST = {
    format_version: 2,
    header: {
        name: 'Loopback player scripts',
        description: 'The visit counter of the client e2e script pack',
        uuid: '6c1f8d2b-4e3a-4f9b-8d7c-8e2f3a4b5c60',
        version: [1, 0, 0],
        min_engine_version: [1, 21, 0]
    },
    modules: [
        {
            type: 'script',
            language: 'javascript',
            uuid: '6c1f8d2b-4e3a-4f9b-8d7c-8e2f3a4b5c61',
            version: [1, 0, 0],
            entry: 'scripts/main.js'
        }
    ],
    dependencies: [{ module_name: '@minecraft/server', version: '2.0.0' }]
};

/** The cinnabar suite's visit counter, as its script pack writes it. */
const SCRIPT = [
    "import { world } from '@minecraft/server';",
    '',
    'world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {',
    '    if (!initialSpawn) return;',
    `    const visits = (player.getDynamicProperty('${VISITS_PROPERTY}') ?? 0) + 1;`,
    `    player.setDynamicProperty('${VISITS_PROPERTY}', visits);`,
    `    player.sendMessage(\`${VISITS_MESSAGE}\${visits} \${player.name}\`);`,
    '});',
    ''
].join('\n');

let jsp: LoopbackServer;

// Booting the server builds its content, the slow part, so it happens once for the file.
beforeAll(async () => {
    jsp = await startLoopbackServer({
        name: 'player-scenarios',
        files: { 'pack/manifest.json': JSON.stringify(MANIFEST), 'pack/scripts/main.js': SCRIPT },
        config: (stateRoot) => ({
            'content-world-packs': [path.join(stateRoot, 'pack')]
        })
    });
}, 1_200_000);

afterAll(async () => {
    await jsp?.close();
}, 60_000);

/** Runs a console command and ticks until it has printed a line matching `answer`. */
const commandAnswering = async (line: string, answer: RegExp): Promise<string> => {
    const { messages } = await jsp.command(line);
    await jsp.until(() => messages.some((message) => answer.test(message)), `"${line}" never answered ${answer}`);
    return messages.find((message) => answer.test(message))!;
};

/** How many players the server counts as online, from the `list` command. */
const onlineCount = async (): Promise<number> =>
    Number(/There are (\d+)/.exec(await commandAnswering('list', /There are \d+/))?.[1]);

describe('duplicate-login', () => {
    /** The name both clients log in with. */
    const TWIN = 'Twin';

    it('replaces a login of an account that is still joining with a second one', async () => {
        const before = await onlineCount();

        // The second login starts once the server logs the first one's join, which comes while the
        // first is still joining: before #2951 the server looked only at players who had finished
        // joining and let both in.
        let firstJoining = false;
        jsp.server.once('playerSpawn', () => {
            firstJoining = true;
        });
        const first = jsp.connect(TWIN);
        let firstSettled = false;
        const settled = (): void => {
            firstSettled = true;
        };
        // The replaced login's join rejects, which is the point, so both outcomes count.
        void first.joined.then(settled, settled);
        await jsp.until(() => firstJoining, 'the first login never started joining', 120);

        const second = jsp.connect(TWIN);
        let secondJoined = false;
        void second.joined.then(() => {
            secondJoined = true;
        });
        await jsp.until(() => secondJoined, 'the second login never joined', 1200);
        // Long enough for the replaced client to be told so and drop out.
        await jsp.tick(60);

        expect(firstSettled, 'the first login is still waiting on its join').toBe(true);
        expect(first.player.client.isConnected(), 'the first login is still connected').toBe(false);
        expect(second.player.client.isConnected(), 'the second login left').toBe(true);
        expect(second.player.session(), 'the server has no player for the second login').toBeDefined();
        expect(await onlineCount(), 'the server counts the twins as other than one player').toBe(before + 1);
        second.player.leave();
        await jsp.tick();
    });
});

describe('frozen-world', () => {
    /** Where the observer is shown the player, or undefined while it is shown none by that name. */
    const shownAt = (observer: LoopbackPlayer, name: string) =>
        observer.world.actors().find((actor) => actor.name === name)?.position;

    /** The world's game time, as `time query gametime` answers it. */
    const gameTime = async (): Promise<number> =>
        Number(/The time is (\d+)/.exec(await commandAnswering('time query gametime', /The time is \d+/))?.[1]);

    it("holds a frozen world's clock still while an observer still sees a player's walk", async () => {
        const walker = await jsp.join('Walker');
        const observer = await jsp.join('Frozen');
        await jsp.until(() => shownAt(observer, walker.name) !== undefined, 'the observer never saw the walker');
        const start = shownAt(observer, walker.name)!;

        await commandAnswering('tick freeze', /The game is frozen/);
        // A freeze that took but whose check failed still has to be undone for the tests after it.
        try {
            const frozenAt = await gameTime();

            // A walk east at about walking speed, one input a tick, as cinnabar holds its forward key
            // for three seconds.
            const before = walker.world.getPosition()!;
            for (let step = 1; step <= 15; step++) {
                await walker.input({ position: { ...before, x: before.x + 0.2 * step } });
                await jsp.tick();
            }
            const after = walker.session()!.getPlayer().getPosition();
            const walked = Math.hypot(after.getX() - before.x, after.getZ() - before.z);
            expect(walked, 'the server did not take the walk').toBeGreaterThan(1);

            // Before the unfreeze: a frozen tick sends what its inputs did, so the observer sees the
            // walk while the world holds still.
            const distance = (): number => {
                const at = shownAt(observer, walker.name);
                return at === undefined ? 0 : Math.hypot(at.x - start.x, at.z - start.z);
            };
            await jsp.until(() => distance() > 1, 'the observer never saw the walk while frozen', 300);
            expect(await gameTime(), "the world's clock moved while frozen").toBe(frozenAt);
        } finally {
            await jsp.command('tick unfreeze');
        }
        walker.leave();
        observer.leave();
        await jsp.tick();
    });
});

describe('player-properties', () => {
    /** The name both visits log in with, so the second finds the record the first left. */
    const RETURNING = 'Visitor';
    const visit = (player: LoopbackPlayer, count: number): boolean =>
        player.world.chat().some((text) => text.message.includes(`${VISITS_MESSAGE}${count} ${RETURNING}`));

    /** Skips on a machine whose server runs no scripts, unless CI asks for a failure. */
    const requireScripts = (context: TestContext): void => {
        const scripted = jsp.server.getScripts() !== undefined;
        if (!scripted && process.env.JSP_SCRIPT_HOST_REQUIRE !== '1') context.skip();
        expect(scripted, 'the server runs no scripts').toBe(true);
    };

    // Two tests, one a login, so each join gets the default timeout; the second reads the record
    // the first left.
    it('counts a first login as visit 1', async (context) => {
        requireScripts(context);
        const first = await jsp.join(RETURNING);
        await jsp.until(() => visit(first, 1), 'the first login never heard "visit 1"', 200);
        await leaveAndWait(jsp, first);
    });

    it("counts the same player's next login as visit 2, so the property survived the logout", async (context) => {
        requireScripts(context);
        const second = await jsp.join(RETURNING);
        await jsp.until(
            () => visit(second, 2),
            'the second login never heard "visit 2": the property did not survive the logout',
            200
        );
        second.leave();
        await jsp.tick();
    });
});

describe('permissions-reload', () => {
    /** What the server answers a player who lacks the command's node. */
    const REFUSED = 'do not have permission';
    /** The node `/tell` needs, which a fresh file grants no player. */
    const NODE = 'minecraft.command.tell';
    const marker = 'loopback-perms';

    /** Whether a value parsed from JSON is an object with string keys. */
    const isRecord = (value: unknown): value is Record<string, unknown> =>
        typeof value === 'object' && value !== null && !Array.isArray(value);

    /**
     * The JSON in a JSON-with-comments file: its comments and trailing commas taken out, strings
     * left as they are. The server writes `permissions.json` with comments, and the client package
     * has no JSONC parser of its own.
     */
    const withoutComments = (text: string): string =>
        text
            .replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_match, string?: string) => string ?? '')
            .replace(
                /("(?:[^"\\]|\\.)*")|,(\s*[}\]])/g,
                (match, string?: string, closer?: string) => string ?? closer ?? match
            );

    /**
     * Edits the player's record in `permissions.json` as an owner's editor would, and writes it back
     * without its comments.
     * @param edit - Changes the record in place.
     */
    const editRecord = (name: string, edit: (record: Record<string, unknown>) => void): void => {
        const file = path.join(jsp.stateRoot, 'permissions.json');
        const document: unknown = JSON.parse(withoutComments(readFileSync(file, 'utf8')));
        const users = isRecord(document) ? document.users : undefined;
        const offline = isRecord(users) ? users.offline : undefined;
        const record = isRecord(offline) ? offline[name] : undefined;
        if (!isRecord(record)) throw new Error(`permissions.json has no offline record for ${name}`);
        edit(record);
        writeFileSync(file, `${JSON.stringify(document, null, 4)}\n`);
    };

    it('follows a /perms grant, a file edit read back by /perms reload, and an expiry, without a rejoin', async () => {
        const player = await jsp.join('Permitted');
        /** Sends a command and ticks until the player is shown a line containing `expected`. */
        const answers = async (line: string, expected: string): Promise<void> => {
            const from = shownCount(player);
            await player.runCommand(line);
            await jsp.until(() => wasShown(player, expected, from), `"${line}" never showed "${expected}"`);
        };
        const whisper = `tell ${player.name} ${marker}`;

        await answers(whisper, REFUSED);

        await commandAnswering(`perms user ${player.name} permission set ${NODE}`, /Set minecraft\.command\.tell for/);
        await answers(whisper, marker);

        // An owner's editor takes the node out of the record; the server reads the file again.
        editRecord(player.name, (record) => {
            record.nodes = [];
        });
        await commandAnswering('perms reload', /Reloaded permissions\.json/);
        await answers(whisper, REFUSED);

        // The expiry is an instant the permission manager compares with a `Date.now` it captured
        // when the server started, so no fake clock reaches it. The timed grant is checked to work,
        // then its instant is moved into the past in the file, which is the state three seconds
        // of wall-clock time would leave.
        await commandAnswering(
            `perms user ${player.name} permission set ${NODE} 3s`,
            /Set minecraft\.command\.tell for/
        );
        await answers(`${whisper}-timed`, `${marker}-timed`);
        editRecord(player.name, (record) => {
            const nodes = Array.isArray(record.nodes) ? record.nodes : [];
            for (const node of nodes) if (isRecord(node)) node.expires = new Date(Date.now() - 1_000).toISOString();
        });
        await commandAnswering('perms reload', /Reloaded permissions\.json/);
        await answers(whisper, REFUSED);
        player.leave();
        await jsp.tick();
    });
});
