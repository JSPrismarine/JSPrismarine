import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import SettingsCommandPacket from './SettingsCommandPacket';

import type { SettingsCommand } from './SettingsCommandPacket';

const COMMAND = '/gamerule showcoordinates true';
const DATA: SettingsCommand = { command: COMMAND, suppressOutput: true };
const BYTES = Buffer.from([0x8c, 0x01, 0x1e, ...Buffer.from(COMMAND, 'utf8'), 0x01]);

describe('SettingsCommandPacket', () => {
    it('writes the command line and suppress-output flag in wire order', () => {
        const buffer = new SettingsCommandPacket(DATA).serialize(new NetworkBinaryStream());

        expect(COMMAND.length).toBe(0x1e);
        expect(buffer).toEqual(BYTES);
    });

    it('reads a hand-built command to the end of the packet', () => {
        const stream = new NetworkBinaryStream(BYTES);
        const data = new SettingsCommandPacket().deserialize(stream);

        expect(data).toEqual(DATA);
        expect(stream.feof()).toBe(true);
    });

    it('writes an empty command as a zero-length string', () => {
        const buffer = new SettingsCommandPacket({ command: '', suppressOutput: false }).serialize(
            new NetworkBinaryStream()
        );

        expect(buffer).toEqual(Buffer.from([0x8c, 0x01, 0x00, 0x00]));
    });
});
