/**
 * A Bedrock client downloads the resource pack of an addon the server installed, and joins with
 * it. The pack is an `.mcpack` in the server's `addons/` folder, which installs as the server
 * boots, and `texturepack-required` is on, so a client that could not download it would be
 * disconnected rather than joining without it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

import { writeZip } from '@jsprismarine/packs/zip';

import type { Scenario } from '../scenario.mts';
import { onlineCount } from '../scenario.mts';

/** The pack's header UUID and version, which the client asks for its chunks by. */
const PACK_UUID = '6f0e2c55-7d0b-4b64-9b1e-3a9c2f6d4e01';
const PACK_VERSION = [1, 0, 0] as const;
const RESOURCE_NAME = `${PACK_UUID}_${PACK_VERSION.join('.')}`;

/**
 * The side of the noise texture, in pixels. Only the RGB bytes of the noise are random, so
 * 384 × 384 deflates to about 430 KiB: more than one 256 KiB chunk, so the client has to ask for
 * a second one at an offset.
 */
const NOISE_SIDE = 384;

/** One PNG chunk: its length, type, data and the CRC of type and data. */
const pngChunk = (type: string, data: Uint8Array): Buffer => {
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.byteLength);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([length, typed, crc]);
};

/** A square RGBA PNG whose pixels `pixel` gives, as `[r, g, b, a]`. */
const png = (side: number, pixel: (x: number, y: number) => readonly number[]): Uint8Array => {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(side, 0);
    header.writeUInt32BE(side, 4);
    // 8 bits per channel, RGBA, deflate, no filter method, no interlace.
    header.set([8, 6, 0, 0, 0], 8);
    const rows = Buffer.alloc(side * (1 + side * 4));
    for (let y = 0; y < side; y++) {
        const row = y * (1 + side * 4);
        for (let x = 0; x < side; x++) rows.set(pixel(x, y), row + 1 + x * 4);
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk('IHDR', header),
        pngChunk('IDAT', deflateSync(rows)),
        pngChunk('IEND', new Uint8Array())
    ]);
};

/** A seeded xorshift32 byte stream, so every run builds the same pack. */
const noise = (seed: number): (() => number) => {
    let state = seed;
    return () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return (state >>> 0) & 0xff;
    };
};

/** The `.mcpack`: a manifest, an icon, and a dirt texture of opaque noise. */
const mcpack = (): Uint8Array => {
    const next = noise(0x2193);
    const manifest = {
        format_version: 2,
        header: {
            name: 'Client e2e resources',
            description: 'A resource pack the client e2e suite installs and the client downloads',
            uuid: PACK_UUID,
            version: PACK_VERSION,
            min_engine_version: [1, 21, 0]
        },
        modules: [
            {
                type: 'resources',
                uuid: '0b5d6a3e-41c2-4f7a-8e9d-2c4b7a1f3e02',
                version: PACK_VERSION
            }
        ]
    };
    return writeZip(
        new Map([
            ['manifest.json', new TextEncoder().encode(JSON.stringify(manifest, null, 4))],
            ['pack_icon.png', png(16, () => [0x3d, 0xb8, 0x9a, 0xff])],
            ['textures/blocks/dirt.png', png(NOISE_SIDE, () => [next(), next(), next(), 0xff])]
        ])
    );
};

/** Every `.mcpack` file under a folder. */
const mcpacksUnder = (directory: string): string[] =>
    fs.existsSync(directory)
        ? fs
              .readdirSync(directory, { recursive: true, withFileTypes: true })
              .filter((entry) => entry.isFile() && entry.name.endsWith('.mcpack'))
              .map((entry) => path.join(entry.parentPath, entry.name))
        : [];

export const resourcePackDownload: Scenario = {
    name: 'resource-pack-download',
    description: 'a client downloads a required resource pack an installed addon holds, and joins with it',
    serverOptions: {
        files: { 'addons/client-e2e-resources.mcpack': mcpack() },
        config: { 'texturepack-required': true }
    },
    run: async ({ server, client, playerName, log }) => {
        const served = new RegExp(
            `Sent ${playerName} the last of (\\d+) chunks of resource pack ${RESOURCE_NAME.replaceAll('.', '\\.')}`
        );
        const line = server.lines.find((candidate) => served.test(candidate));
        assert.ok(
            line !== undefined,
            `the server never sent ${playerName} the last chunk of ${RESOURCE_NAME}; server: ${server.lines.slice(-10).join(' | ')}`
        );
        const chunks = Number(served.exec(line)?.[1]);
        assert.ok(chunks >= 2, `the pack went out in ${chunks} chunk(s), not the several the noise texture needs`);

        const state = await client.state();
        assert.equal(state.in_world, true, 'the client is not in the world after downloading the pack');
        assert.equal(await onlineCount(server), 1, 'the client is not online after downloading the pack');

        // The pack is required, so a client that joined took it, and the server sent every chunk.
        // cinnabar keeps a verified download in its pack cache only in the launch modes that pass
        // it a cache folder, so the cache is reported rather than asserted.
        const cached = mcpacksUnder(path.join(server.dir, 'client-user-root'));
        log(
            `the client downloaded ${RESOURCE_NAME} in ${chunks} chunks; ${
                cached.length > 0 ? `cached at ${cached.join(', ')}` : 'no pack cache under its user root'
            }`
        );
    }
};
