import { describe, expect, it } from 'vitest';

import SettingsCommandPacket from './SettingsCommandPacket';

// Packet id 140 as a varuint.
const HEADER = [0x8c, 0x01];

const COMMAND = '/gamerule showcoordinates true';
// Thirty ASCII bytes, so the varuint32 length prefix is a single byte.
const COMMAND_BYTES = [0x1e, ...Buffer.from(COMMAND, 'utf8')];

describe('SettingsCommandPacket', () => {
    it('writes the command line then the suppress flag', () => {
        const packet = new SettingsCommandPacket();
        packet.command = COMMAND;
        packet.suppressOutput = true;
        packet.encode();

        expect(COMMAND.length).toBe(0x1e);
        expect(packet.getBuffer()).toEqual(Buffer.from([...HEADER, ...COMMAND_BYTES, 0x01]));
    });

    it('reads a command line and the suppress flag, consuming the whole buffer', () => {
        const packet = new SettingsCommandPacket();
        packet.setReadBuffer(Buffer.from([...HEADER, ...COMMAND_BYTES, 0x00]));
        packet.decode();

        expect(packet.command).toBe(COMMAND);
        expect(packet.suppressOutput).toBe(false);
        expect(packet.feof()).toBe(true);
    });

    it('writes an empty command as a zero length prefix', () => {
        const packet = new SettingsCommandPacket();
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([...HEADER, 0x00, 0x00]));
    });
});
