/**
 * A Java Edition client on the server: `@jsprismarine/client`'s `JavaClient` joins a stepped
 * flat-world server over TCP, beside a Bedrock client on a loopback pipe, and each sees what the
 * other does.
 */
import { SetCenterChunk } from '@jsprismarine/protocol/java/packet/play';
import type { JavaText } from '@jsprismarine/protocol/java/wire/javaTypes';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { JavaClient } from '../java/JavaClient';
import type { LoopbackServer } from '../testing/loopbackServer.test-utils';
import { startLoopbackServer } from '../testing/loopbackServer.test-utils';
import { shownText } from './scenarioSupport.test-utils';

/** A text component's words, with every translation argument, as one string to search. */
const wordsOf = (text: JavaText): string =>
    typeof text === 'string' ? text : [text.translate, ...(text.with ?? []).map(wordsOf)].join(' ');

describe('a Java Edition client', () => {
    let loopback: LoopbackServer;
    let java: JavaClient;
    const chat: string[] = [];

    beforeAll(async () => {
        loopback = await startLoopbackServer({
            name: 'java-client',
            config: { 'java-enabled': true, 'java-port': 0 }
        });
        java = await loopback.joinJava('Alex', { language: 'sv_se' });
        java.on('chat', (content) => chat.push(wordsOf(content)));
    }, 120_000);

    afterAll(async () => {
        await loopback?.close();
    });

    it('joins in play, placed in the world, with the chunks around it', () => {
        const pose = java.getPose();

        expect(java.getPhase()).toBe('play');
        expect(pose).toBeDefined();
        expect(java.getLogin()?.dimension).toBe('minecraft:overworld');
        expect(java.hasChunk(Math.floor(pose!.x / 16), Math.floor(pose!.z / 16))).toBe(true);
    });

    it("plays in the language its settings name, which scripts read as the player's locale", () => {
        const alex = loopback.server
            .getSessionManager()
            .getSessions()
            .find((entry) => entry.getName() === 'Alex');

        expect(alex?.getPlayer().locale).toBe('sv_SE');
    });

    it('moves its player on the server', async () => {
        const from = java.getPose()!;
        const session = () =>
            loopback.server
                .getSessionManager()
                .getSessions()
                .find((entry) => entry.getName() === 'Alex');

        java.move({ x: from.x + 2, z: from.z + 1 });
        await loopback.untilJava(
            () => Math.abs((session()?.getPlayer().getPosition().getX() ?? Number.NaN) - (from.x + 2)) < 0.01,
            "Alex's move never reached the server"
        );

        expect(session()?.getPlayer().getPosition().getZ()).toBeCloseTo(from.z + 1);
    });

    it('chats with a Bedrock player, both ways', async () => {
        const steve = await loopback.join('Steve');

        java.chat('hello from Java');
        await loopback.untilJava(
            () => shownText(steve).some((line) => line.includes('hello from Java')),
            'Steve never saw what Alex said'
        );

        await steve.chat('hello from Bedrock');
        await loopback.untilJava(
            () => chat.some((line) => line.includes('hello from Bedrock')),
            'Alex never saw what Steve said'
        );
    });

    it('is sent the chunks ahead of its player as it walks, after answering each batch', async () => {
        const pose = java.getPose()!;
        const ahead = { x: Math.floor(pose.x / 16) + 4, z: Math.floor(pose.z / 16) };
        let center: { readonly x: number; readonly z: number } | undefined;
        void java.next(SetCenterChunk).then((moved) => {
            center = moved;
        });

        // Two chunks over: the view moves its center, and the server sends the column four ahead.
        java.move({ x: pose.x + 32 });
        await loopback.untilJava(() => java.hasChunk(ahead.x, ahead.z), 'the chunk ahead never came');

        expect(center).toEqual({ x: Math.floor((pose.x + 32) / 16), z: ahead.z });
    });
});
