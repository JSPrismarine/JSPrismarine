/**
 * A Java player turns on the TPS bar addon's boss bar with `/tpsbar` and keeps it through several
 * redraws. The bar goes out as `Boss Event`: an add, then a name and progress update each second.
 * HeadlessMC's console has no command that reports the HUD, so this checks what the client can
 * say: the command's answer reaches it, and no `Boss Event` it could not read disconnects it.
 * What each packet carries is checked by `JavaPresenter.test.ts` and `BossBar.test.ts`.
 */
import type { JavaScenario } from '../java-run.mts';
import { inWorld, joinWorld } from './support.mts';

/** How long the client holds the bar, about five redraws, with nothing ending the connection. */
const WATCH_MS = 5_000;

/** How long each command may take to answer. */
const COMMAND_MS = 15_000;

/** What the client prints when the connection ends, a packet it could not read among them. */
const DISCONNECT = /Client disconnected|Disconnected from|Lost connection|Failed to decode/;

export const tpsBar: JavaScenario = {
    name: 'tps-bar',
    serverOptions: { addons: ['tps-bar'] },
    run: async (context) => {
        const { client, server } = context;
        const joining = server.waitForLine(/(\S+) is joining over Java from /, 90_000);
        await joinWorld(context);
        const name = /(\S+) is joining over Java from /.exec(await joining)?.[1];
        if (name === undefined) throw new Error('the server never named the Java player');
        await inWorld(context);

        // `/tpsbar` is an operator command.
        const opped = server.waitForLine(/Opped 1 player/, COMMAND_MS);
        server.command(`op ${name}`);
        await opped;

        const disconnected = client.waitForLine(DISCONNECT, COMMAND_MS + WATCH_MS).then(
            (line) => line,
            () => undefined
        );
        const on = client.waitForLine(/TPS bar on\./, COMMAND_MS);
        client.command('msg /tpsbar');
        await on;

        const ended = await Promise.race([
            disconnected,
            new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), WATCH_MS))
        ]);
        if (ended !== undefined) throw new Error(`the client was disconnected: ${ended}`);
    }
};
