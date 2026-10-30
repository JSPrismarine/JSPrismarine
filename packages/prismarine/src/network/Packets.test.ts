import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PacketIdentifier } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import { latestCodec } from './codec/CodecRegistry';
import * as Handlers from './Handlers';
import Identifiers from './Identifiers';
import * as Packets from './Packets';

const here = fileURLToPath(new URL('.', import.meta.url));

/** Handler interfaces that live beside the handlers but are not handlers themselves. */
const HANDLER_INTERFACES = new Set(['PacketHandler', 'ConnectionPacketHandler']);

/** Keys of `Identifiers` that describe the protocol rather than a packet. */
const HEADER_CONSTANTS = new Set(['Protocol', 'MinecraftVersions']);

/** Module names (file names without `.ts`) under `dir` that end in `suffix`, excluding tests. */
const moduleNames = (dir: string, suffix: string) =>
    readdirSync(`${here}${dir}`)
        .filter((file) => file.endsWith(`${suffix}.ts`) && !file.includes('.test.'))
        .map((file) => file.slice(0, -'.ts'.length))
        .sort();

/** Default-import specifiers of a barrel, in source order. */
const importOrder = (barrel: string, dir: string) =>
    Array.from(
        readFileSync(`${here}${barrel}`, 'utf8').matchAll(new RegExp(`^import (\\w+) from '\\./${dir}/`, 'gm'))
    ).map(([, name]) => name);

const packetIds = new Map(
    Object.entries(Identifiers).flatMap(([name, id]) =>
        HEADER_CONSTANTS.has(name) || typeof id !== 'number' ? [] : [[name, id] as const]
    )
);

describe('network/Packets', () => {
    const files = moduleNames('packet', 'Packet');
    const exported = Object.entries(Packets);

    it('exports every packet file under its own name and nothing else', () => {
        expect(exported.map(([name]) => name).sort()).toStrictEqual(files);
        for (const [name, packet] of exported) expect(packet.name, name).toBe(name);
    });

    it('keeps the barrel sorted', () => {
        expect(importOrder('Packets.ts', 'packet')).toStrictEqual(files);
    });

    it('gives every registered packet an id under its name, at the version that has it', () => {
        // Resolved against the newest codec: a packet a later protocol added has no id at 2193,
        // and the barrel carries it so a session on that version can build one.
        for (const [name] of exported) expect(latestCodec.netIdOf(name), name).toBe(latestCodec.ids[name]);
        const ids = exported.map(([name]) => latestCodec.netIdOf(name));
        expect(new Set(ids).size).toBe(exported.length);
    });
});

describe('network/Handlers', () => {
    const files = moduleNames('handler', 'Handler').filter((name) => !HANDLER_INTERFACES.has(name));
    const exported = Object.entries(Handlers);

    it('exports every handler file under its own name and nothing else', () => {
        expect(exported.map(([name]) => name).sort()).toStrictEqual(files);
        for (const [name, handler] of exported) expect(handler.name, name).toBe(name);
    });

    it('keeps the barrel sorted', () => {
        expect(importOrder('Handlers.ts', 'handler')).toStrictEqual(files);
    });

    it('binds every handler to the exported packet of the same name', () => {
        const packets = new Map(Object.entries(Packets));
        for (const [name, handler] of exported) {
            const packetName = name.replace(/Handler$/, 'Packet');
            expect(packets.has(packetName), name).toBe(true);
            expect(handler.PacketName, name).toBe(packetName);
        }
        expect(new Set(exported.map(([, handler]) => handler.PacketName)).size).toBe(exported.length);
    });
});

describe('network/Identifiers', () => {
    it('lists exactly the packet ids of @jsprismarine/protocol under matching names', () => {
        const members = Object.keys(PacketIdentifier).filter((key) => Number.isNaN(Number(key)));
        expect(packetIds.size).toBe(members.length);
        expect(new Set(packetIds.values()).size).toBe(packetIds.size);
        for (const [name, id] of packetIds) {
            const member: string | undefined = PacketIdentifier[id];
            expect(member, `${name} = 0x${id.toString(16)}`).toBeDefined();
            expect(`${member?.replaceAll('_', '')}packet`.toLowerCase(), name).toBe(name.toLowerCase());
        }
    });
});
