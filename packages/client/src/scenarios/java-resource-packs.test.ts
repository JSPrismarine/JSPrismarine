// @module-tag integration

/**
 * A Java Edition client and an installed addon's resource pack: the server converts the Bedrock
 * pack into a Java one, pushes it as the client configures, and serves it from its own Java port,
 * so the client downloads it, checks its SHA-1 and loads it before it joins.
 */
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { ClientErrors } from '@jsprismarine/errors/client';
import { JavaResourcePackAction } from '@jsprismarine/protocol/java/packet/configuration';
import { PlayResourcePackPop } from '@jsprismarine/protocol/java/packet/play';
import { readZip, writeZip } from '@jsprismarine/packs/zip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { LoopbackServer } from '../testing/loopbackServer.test-utils';
import { startLoopbackServer } from '../testing/loopbackServer.test-utils';

const encoder = new TextEncoder();

/** A Bedrock resource pack with one language file, as an addon's `.mcpack` holds it. */
const mcpack = (uuid: string, lang: string): Uint8Array =>
    writeZip(
        new Map([
            [
                'manifest.json',
                encoder.encode(
                    JSON.stringify({
                        format_version: 2,
                        header: {
                            name: 'Loopback resources',
                            uuid,
                            version: [1, 0, 0],
                            min_engine_version: [1, 21, 0]
                        },
                        modules: [
                            { type: 'resources', uuid: '5d7c1e2a-4b3f-4a6e-9c8d-1e2f3a4b5c61', version: [1, 0, 0] }
                        ]
                    })
                )
            ],
            ['texts/en_US.lang', encoder.encode(lang)]
        ])
    );

describe("a Java Edition client and an addon's resource pack", () => {
    let loopback: LoopbackServer;

    beforeAll(async () => {
        loopback = await startLoopbackServer({
            name: 'java-resource-packs',
            config: { 'java-enabled': true, 'java-port': 0, 'texturepack-required': true },
            files: {
                'addons/loopback-resources.mcpack': mcpack(
                    '5d7c1e2a-4b3f-4a6e-9c8d-1e2f3a4b5c60',
                    'tile.loopback:lamp.name=Loopback Lamp'
                )
            }
        });
    }, 120_000);

    afterAll(async () => {
        await loopback?.close();
    });

    it("downloads the converted pack from the server's Java port as it configures, and joins with it", async () => {
        const java = await loopback.joinJava('Alex');
        const [pack, ...others] = java.getResourcePacks().values();

        expect(others).toEqual([]);
        expect(pack!.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/resource-packs\/[0-9a-f]{40}\.zip$/);
        expect(pack!.url).toContain(pack!.sha1);
        const files = readZip(pack!.bytes);
        expect(files.has('pack.mcmeta')).toBe(true);
        expect(JSON.parse(new TextDecoder().decode(files.get('assets/bedrock/lang/en_us.json')))).toEqual({
            'tile.loopback:lamp.name': 'Loopback Lamp'
        });
    });

    it('takes the pack of an addon installed while the player plays, and lets the old one go once it loaded', async () => {
        const java = await loopback.joinJava('Sam');
        const [before] = java.getResourcePacks().keys();
        writeFileSync(
            path.join(loopback.stateRoot, 'addons', 'loopback-more.mcpack'),
            mcpack('5d7c1e2a-4b3f-4a6e-9c8d-1e2f3a4b5c62', 'tile.loopback:chair.name=Loopback Chair')
        );

        await loopback.command('addon sync');
        await loopback.untilJava(
            () => java.getResourcePacks().size === 1 && !java.getResourcePacks().has(before!),
            'the client never swapped to the pack with the new addon'
        );

        const [pack] = java.getResourcePacks().values();
        const lang = JSON.parse(new TextDecoder().decode(readZip(pack!.bytes).get('assets/bedrock/lang/en_us.json')));
        expect(lang).toEqual({
            'tile.loopback:chair.name': 'Loopback Chair',
            'tile.loopback:lamp.name': 'Loopback Lamp'
        });
    });

    it('discards a pack the server removed while the client was still downloading it', async () => {
        // The real download, held at a gate the test opens, so the removal lands while it runs.
        let gate: PromiseWithResolvers<void> | undefined;
        const downloads: string[] = [];
        const java = await loopback.joinJava('Lee', {
            fetch: async (url, init) => {
                downloads.push(String(url));
                await gate?.promise;
                return fetch(url, init);
            }
        });
        const [loaded] = java.getResourcePacks().keys();
        const answers: string[] = [];
        java.on('resourcePack', (id, action) => answers.push(`${id} ${JavaResourcePackAction[action]}`));
        gate = Promise.withResolvers<void>();

        // A third addon: the server pushes a pack with it, whose download waits at the gate.
        const third = path.join(loopback.stateRoot, 'addons', 'loopback-third.mcpack');
        writeFileSync(third, mcpack('5d7c1e2a-4b3f-4a6e-9c8d-1e2f3a4b5c63', 'tile.loopback:table.name=Loopback Table'));
        await loopback.command('addon sync');
        await loopback.untilJava(() => downloads.length === 2, 'the client never started the second download');
        const pushed = downloads[1]!;

        // The addon goes again before the download finishes: the server removes the pack it pushed
        // and goes back to the one the client has.
        let removed: string | null | undefined;
        void java.next(PlayResourcePackPop).then(({ id }) => {
            removed = id;
        });
        rmSync(third);
        await loopback.command('addon sync');
        await loopback.untilJava(() => removed !== undefined, 'the server never removed the pack still downloading');
        gate.resolve();
        await loopback.untilJava(() => answers.length === 1, 'the client never finished with the removed pack');

        expect(removed).not.toBe(loaded);
        expect(pushed).toContain('/resource-packs/');
        expect(answers).toEqual([`${removed} Discarded`]);
        expect([...java.getResourcePacks().keys()]).toEqual([loaded]);
    });

    it('turns away a client that declines the pack the server requires', async () => {
        // The server's disconnect, not the scenario running out of ticks, which throws another error.
        const refused = loopback.joinJava('Steve', { resourcePacks: 'decline' });
        await expect(refused).rejects.toBeInstanceOf(ClientErrors.DisconnectedByServer);
        await expect(refused).rejects.toThrow('multiplayer.requiredTexturePrompt.disconnect');
    });
});
