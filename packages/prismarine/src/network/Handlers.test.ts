import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { Packets } from '@jsprismarine/protocol';
import * as Handlers from './Handlers';

const here = fileURLToPath(new URL('.', import.meta.url));

/** Handler interfaces beside the handlers, rather than concrete packet handlers. */
const HANDLER_INTERFACES = new Set(['PacketHandler', 'ConnectionPacketHandler']);

/** Handler module names under `dir`, excluding tests and interface-only modules. */
const handlerModuleNames = () =>
    readdirSync(`${here}handler`)
        .filter(
            (file) =>
                file.endsWith('Handler.ts') && !file.includes('.test.') && !HANDLER_INTERFACES.has(file.slice(0, -3))
        )
        .map((file) => file.slice(0, -'.ts'.length))
        .sort();

/** Default-import specifiers in a barrel, in source order. */
const importOrder = () =>
    Array.from(readFileSync(`${here}Handlers.ts`, 'utf8').matchAll(/^import (\w+) from '\.\/handler\//gm)).map(
        ([, name]) => name
    );

describe('network/Handlers', () => {
    const files = handlerModuleNames();
    const exported = Object.entries(Handlers);

    it('exports every handler module under its own name and nothing else', () => {
        expect(exported.map(([name]) => name).sort()).toStrictEqual(files);
        for (const [name, handler] of exported) expect(handler.name, name).toBe(name);
    });

    it('keeps the handler barrel sorted', () => {
        expect(importOrder()).toStrictEqual(files);
    });

    it('binds each handler to a packet exported by Protocol', () => {
        const packets = new Set(Object.keys(Packets));
        for (const [name, handler] of exported) {
            const packetName = name.replace(/Handler$/, 'Packet');
            expect(packets.has(packetName), name).toBe(true);
            expect(handler.PacketName, name).toBe(packetName);
        }
        expect(new Set(exported.map(([, handler]) => handler.PacketName)).size).toBe(exported.length);
    });
});
