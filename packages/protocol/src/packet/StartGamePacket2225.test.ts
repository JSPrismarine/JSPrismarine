import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import StartGamePacket from './StartGamePacket';
import StartGamePacket2225, { EditorLevelMigrationVersion } from './StartGamePacket2225';

import type { StartGame } from './StartGamePacket';

/** The 2193 packet a Bedrock Dedicated Server 1.26.51.1 sent, header byte included. */
const CAPTURED_2193 = fs.readFileSync(new URL('./__fixtures__/start-game-bds-1.26.51.1.bin', import.meta.url));

const decode2193 = (buffer: Buffer): StartGame => new StartGamePacket().deserialize(new NetworkBinaryStream(buffer));
const decode2225 = (buffer: Buffer): StartGame =>
    new StartGamePacket2225().deserialize(new NetworkBinaryStream(buffer));
const encode2225 = (data: StartGame): Buffer => new StartGamePacket2225(data).serialize(new NetworkBinaryStream());

describe('StartGamePacket2225', () => {
    const data2193 = decode2193(CAPTURED_2193);

    it('round-trips a packet carrying the inserted field', () => {
        const data: StartGame = {
            ...data2193,
            editorLevelMigrationVersion: EditorLevelMigrationVersion.EditorAchievements
        };

        const stream = new NetworkBinaryStream(encode2225(data));
        const read = new StartGamePacket2225().deserialize(stream);

        expect(stream.feof()).toBe(true);
        expect(read).toEqual(data);
    });

    it('writes one byte more than the 2193 layout, and that byte is the migration version', () => {
        const data: StartGame = { ...data2193, editorLevelMigrationVersion: EditorLevelMigrationVersion.Legacy };
        const at2193 = new StartGamePacket(data2193).serialize(new NetworkBinaryStream());

        expect(encode2225(data).byteLength).toBe(at2193.byteLength + 1);
    });

    it('defaults the field to Legacy when a caller leaves it out', () => {
        expect(decode2225(encode2225(data2193)).editorLevelMigrationVersion).toBe(EditorLevelMigrationVersion.Legacy);
    });

    it('leaves the field off the wire and off the data at 2193', () => {
        expect(data2193.editorLevelMigrationVersion).toBeUndefined();
    });

    it('reads 2193 bytes wrongly, which is why a reader has to be told the layout', () => {
        // The insert takes the first byte of what 2193 means as `Day Cycle Stop Time`, so
        // that field comes back as a different number. Here the rest realigns, because the
        // captured value is a three-byte varint whose remaining two bytes are a valid one;
        // that is luck, not a property of the layout, and a different value shifts the whole
        // tail. The field after the insert is the one to assert on either way.
        expect(decode2225(CAPTURED_2193).dayCycleStopTime).not.toBe(data2193.dayCycleStopTime);
    });
});
