import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { Packets } from '@jsprismarine/protocol';
import { isIntentKind, laneOfIntents } from '../../input/Intent';
import * as Handlers from '../Handlers';
import * as Decoders from './Decoders';

const here = fileURLToPath(new URL('.', import.meta.url));

/** Decoder module names beside this file, excluding tests and the shape and helper modules. */
const decoderModuleNames = () =>
    readdirSync(here)
        .filter((file) => file.endsWith('Decoder.ts') && !file.includes('.test.') && file !== 'PacketDecoder.ts')
        .map((file) => file.slice(0, -'.ts'.length))
        .sort();

describe('network/decoder/Decoders', () => {
    const exported = Object.entries(Decoders);

    it('exports every decoder module under its own name and nothing else', () => {
        expect(exported.map(([name]) => name).sort()).toStrictEqual(decoderModuleNames());
        for (const [name, decoder] of exported) expect(decoder.name, name).toBe(name);
    });

    it('binds each decoder to a packet exported by Protocol that no handler also takes', () => {
        const packets = new Set(Object.keys(Packets));
        const handled = new Set(Object.values(Handlers).map((handler) => handler.PacketName));
        for (const [name, decoder] of exported) {
            const packetName = name.replace(/Decoder$/, 'Packet');
            expect(packets.has(packetName), name).toBe(true);
            expect(decoder.PacketName, name).toBe(packetName);
            expect(handled.has(packetName), `${name} has a handler too`).toBe(false);
        }
        expect(new Set(exported.map(([, decoder]) => decoder.PacketName)).size).toBe(exported.length);
    });

    it('declares at least one intent kind from the table, which sets its lane', () => {
        for (const [name, Decoder] of exported) {
            const decoder = new Decoder();
            expect(decoder.intents.length, name).toBeGreaterThan(0);
            for (const kind of decoder.intents) expect(isIntentKind(kind), `${name} declares ${kind}`).toBe(true);
            expect(laneOfIntents(decoder.intents), name).not.toBe('connection');
        }
    });
});
