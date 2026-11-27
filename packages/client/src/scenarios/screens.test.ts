/**
 * A behavior pack script shows a joined player a `@minecraft/server-ui` `CustomForm`: the client
 * gets the form's data store property and the screen, the player's toggle and click run the
 * script's subscriber and button callback while the screen stays up, and `show()` settles once
 * the player dismisses it. Then the script closes a second form itself, which the client reports
 * closed as a player's client does.
 *
 * A machine without the script host library runs no scripts, so the test skips there unless
 * `JSP_SCRIPT_HOST_REQUIRE=1` asks for a failure instead, as CI does on Linux x64.
 */
import { TextPacket } from '@jsprismarine/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ScriptedServer } from '../testing/scriptedServer.test-utils';
import { joinScriptedServer } from '../testing/scriptedServer.test-utils';

describe("a script's data-driven screen", () => {
    let session: ScriptedServer | undefined;

    // Booting the server builds its content, the slow part, so it happens once, before the test.
    beforeAll(async () => {
        session = await joinScriptedServer({
            name: 'screens',
            uuids: ['3013d60d-1808-4122-860e-9580671f734f', '92ae7a25-d2a2-41c4-ab53-b0edb583b9bf'],
            dependencies: [
                { module_name: '@minecraft/server', version: '2.0.0' },
                { module_name: '@minecraft/server-ui', version: '2.1.0' }
            ],
            // Shows the first form when it rains and the second when it thunders, which the test
            // makes happen after the join.
            script: `import { world } from '@minecraft/server';
import { CustomForm, ObservableBoolean } from '@minecraft/server-ui';
const lights = new ObservableBoolean(false, { clientWritable: true });
lights.subscribe((on) => world.sendMessage('lights ' + on));
world.afterEvents.weatherChange.subscribe(({ newWeather }) => {
    const player = world.getAllPlayers()[0];
    if (newWeather === 'Rain') {
        new CustomForm(player, 'Settings')
            .toggle('Lights', lights)
            .button('Apply', () => world.sendMessage('applied'))
            .show()
            .then((reason) => world.sendMessage('settings ' + reason));
    } else if (newWeather === 'Thunder') {
        const form = new CustomForm(player, 'Notice').label('Bye');
        form.show().then((reason) => world.sendMessage('notice ' + reason));
        form.close();
    }
});`,
            displayName: 'Viewer'
        });
    }, 300_000);

    afterAll(async () => {
        await session?.close();
    }, 60_000);

    it('reaches a joined player, takes its writes and clicks, and settles when it closes', async (context) => {
        if (!session?.scripted && process.env.JSP_SCRIPT_HOST_REQUIRE !== '1') context.skip();
        expect(session?.scripted).toBe(true);
        if (session === undefined) return;
        const { server, client, settle } = session;
        const lines: string[] = [];
        client.getSession().registerHandler(TextPacket, {
            phases: ['play'],
            handle: (text) => void lines.push(text.message)
        });
        const screens = client.getScreens();
        const world = server.getWorldManager().getEntryWorld();
        // A chat line a callback sends goes out with a later tick's sends, so this steps the server
        // until the scripts have sent `count` lines, or gives up after a few ticks.
        const linesAfterTicks = async (count: number): Promise<string[]> => {
            for (let tick = 0; tick < 5 && lines.length < count; tick++) {
                server.advanceTick();
                await settle();
            }
            return lines;
        };

        world.setWeather('rain', 6000);
        server.advanceTick();
        await settle();
        const [shown] = screens.screens();
        expect(shown?.screenId).toBe('minecraft:custom_form');
        expect(shown?.values.get('title')).toBe('Settings');
        expect(shown?.values.get('layout[0].toggled')).toBe(false);
        expect(shown?.values.get('layout[1].label')).toBe('Apply');
        if (shown === undefined) return;

        await screens.write(shown.formId, 'layout[0].toggled', true);
        await screens.click(shown.formId, 'layout[1].onClick');
        expect(await linesAfterTicks(2)).toEqual(['lights true', 'applied']);
        expect(screens.screens()).toHaveLength(1);

        await screens.close(shown.formId);
        expect(await linesAfterTicks(3)).toEqual(['lights true', 'applied', 'settings ClientClosed']);
        expect(screens.screens()).toEqual([]);

        // The server closes the second screen in the flush that shows it; the client reports it
        // closed, and the next flush settles it.
        world.setWeather('thunder', 6000);
        expect((await linesAfterTicks(4)).at(-1)).toBe('notice ServerClosed');
        expect(screens.screens()).toEqual([]);
    });
});
