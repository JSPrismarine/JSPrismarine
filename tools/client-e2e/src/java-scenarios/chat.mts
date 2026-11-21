/**
 * Chat both ways: what a Java player types reaches the chat every player hears, which the
 * console shows, and what the server says reaches the Java player.
 */
import type { JavaScenario } from '../java-run.mts';
import { joinWorld } from './support.mts';

export const chat: JavaScenario = {
    name: 'chat',
    run: async (context) => {
        const { client, server } = context;
        await joinWorld(context);

        const heard = server.waitForLine(/hello from java/, 15_000);
        client.command('msg hello from java');
        await heard;

        const shown = client.waitForLine(/hello to java/, 15_000);
        server.command('say hello to java');
        await shown;
    }
};
