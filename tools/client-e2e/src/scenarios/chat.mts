/** Verifies a client chat line crosses the wire: the server console must print it. */
import type { Scenario } from '../scenario.mts';

export const chat: Scenario = {
    name: 'chat',
    description: 'a chat message sent by the client reaches the server console',
    run: async ({ client, server, playerName, log }) => {
        const marker = `e2e-chat-${Date.now()}`;
        const seen = server.waitForLine(new RegExp(`${playerName}.*${marker}`), 30_000);
        await client.chat(marker);
        await seen;
        log(`server echoed chat from ${playerName}`);
    }
};
