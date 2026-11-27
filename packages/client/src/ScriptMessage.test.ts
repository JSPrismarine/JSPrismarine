import { TextPacket } from '@jsprismarine/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ScriptedServer } from './testing/scriptedServer.test-utils';
import { joinScriptedServer } from './testing/scriptedServer.test-utils';

const MESSAGE = 'script says: the weather is now ';

/**
 * A behavior pack script reaches a player: the weather changes, the script's `weatherChange`
 * after-event runs in the script flush of that tick, and its `world.sendMessage` arrives at the
 * player's client as a line of chat.
 */
describe("a script's world.sendMessage", () => {
    let session: ScriptedServer | undefined;

    // Booting the server builds its content, the slow part, so it happens once, before the test.
    beforeAll(async () => {
        session = await joinScriptedServer({
            name: 'messenger',
            uuids: ['c7f3e8a4-5b9d-4e1f-a2c3-3d4e5f6a7b82', 'd8a4f9b5-6cae-4f2a-b3d4-4e5f6a7b8c93'],
            dependencies: [{ module_name: '@minecraft/server', version: '2.0.0' }],
            script: `import { world } from '@minecraft/server';
world.afterEvents.weatherChange.subscribe((event) => world.sendMessage('${MESSAGE}' + event.newWeather));`,
            displayName: 'Listener'
        });
    }, 300_000);

    afterAll(async () => {
        await session?.close();
    }, 60_000);

    it('reaches a joined player as a chat line in the tick the weather changed', async (context) => {
        // A machine without the script host library runs no scripts; CI requires it on Linux x64.
        if (!session?.scripted && process.env.JSP_SCRIPT_HOST_REQUIRE !== '1') context.skip();
        expect(session?.scripted).toBe(true);
        if (session === undefined) return;
        const { server, client, settle } = session;

        const lines: string[] = [];
        client.getSession().registerHandler(TextPacket, {
            phases: ['play'],
            handle: (text) => void lines.push(text.message)
        });

        // Between ticks, as a console `/weather rain` would land; the next tick's flush runs the after-event.
        server.getWorldManager().getEntryWorld().setWeather('rain', 6000);
        expect(lines).toEqual([]);
        server.advanceTick();
        await settle();

        expect(lines).toEqual([`${MESSAGE}Rain`]);
    });
});
