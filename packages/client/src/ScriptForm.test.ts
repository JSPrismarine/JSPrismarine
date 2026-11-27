// @module-tag integration

import { ModalFormRequestPacket, ModalFormResponsePacket, TextPacket } from '@jsprismarine/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DecodedPacket } from './net/ClientPacketRegistry';
import type { ScriptedServer } from './testing/scriptedServer.test-utils';
import { joinScriptedServer } from './testing/scriptedServer.test-utils';

/**
 * A behavior pack script shows a joined player a form: the client receives the form's JSON as a
 * `ModalFormRequestPacket`, answers with a `ModalFormResponsePacket`, and the script's `show()`
 * promise settles with the answer in the script flush of the tick the answer arrived in, where
 * the script reports it back as a line of chat.
 */
describe("a script's form", () => {
    let session: ScriptedServer | undefined;

    // Booting the server builds its content, the slow part, so it happens once, before the test.
    beforeAll(async () => {
        session = await joinScriptedServer({
            name: 'asker',
            uuids: ['e1a2b3c4-5d6e-4f70-8192-a3b4c5d6e7f8', 'f2b3c4d5-6e7f-4081-92a3-b4c5d6e7f809'],
            dependencies: [
                { module_name: '@minecraft/server', version: '2.0.0' },
                { module_name: '@minecraft/server-ui', version: '2.0.0' }
            ],
            // Shows the form once the weather changes, which the test does after the join.
            script: `import { world } from '@minecraft/server';
import { ActionFormData } from '@minecraft/server-ui';
world.afterEvents.weatherChange.subscribe(() => {
    new ActionFormData().title('Pick').button('a').button('b')
        .show(world.getAllPlayers()[0])
        .then((response) => world.sendMessage('picked ' + response.selection));
});`,
            displayName: 'Answerer'
        });
    }, 300_000);

    afterAll(async () => {
        await session?.close();
    }, 60_000);

    it("reaches a joined player, and the player's answer settles show()", async (context) => {
        // A machine without the script host library runs no scripts; CI requires it on Linux x64.
        if (!session?.scripted && process.env.JSP_SCRIPT_HOST_REQUIRE !== '1') context.skip();
        expect(session?.scripted).toBe(true);
        if (session === undefined) return;
        const { server, client, settle } = session;

        const forms: string[] = [];
        const lines: string[] = [];
        // A field packet keeps its payload in its fields, so the decoded packet itself is read.
        client.on('packet', ({ packet }: DecodedPacket) => {
            if (!(packet instanceof ModalFormRequestPacket)) return;
            forms.push(packet.formUiJson);
            const answer = Object.assign(new ModalFormResponsePacket(), { formId: packet.formId, jsonResponse: '1' });
            void client.getSession().track(client.getSession().send(answer));
        });
        client.getSession().registerHandler(TextPacket, {
            phases: ['play'],
            handle: (text) => void lines.push(text.message)
        });

        // The tick's flush shows the form; the answer arrives before the next tick.
        server.getWorldManager().getEntryWorld().setWeather('rain', 6000);
        server.advanceTick();
        await settle();
        expect(forms).toEqual([
            '{"content":"","elements":[{"image":null,"text":"a","type":"button"},' +
                '{"image":null,"text":"b","type":"button"}],"title":"Pick","type":"form"}\n'
        ]);
        expect(lines).toEqual([]);

        server.advanceTick();
        await settle();
        expect(lines).toEqual(['picked 1']);
    });
});
