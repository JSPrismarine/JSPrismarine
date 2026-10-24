import { describe, expect, it } from 'vitest';
import BlockPosition from '../../world/BlockPosition';
import CommandBlockUpdatePacket, { CommandBlockMode } from './CommandBlockUpdatePacket';

describe('CommandBlockUpdatePacket', () => {
    // Header 0x4e.
    const tail = Buffer.from([
        0x03,
        0x73,
        0x61,
        0x79, // "say"
        0x00, // last output ""
        0x01,
        0x6e, // name "n"
        0x00, // filtered name ""
        0x01, // track output
        0x14,
        0x00,
        0x00,
        0x00, // tick delay 20
        0x00 // execute on first tick
    ]);

    it('decodes a block target with position, mode, and flags, consuming the whole buffer', () => {
        // Selector 1. Position 1, 2, 3 zigzags to 2, 4, 6. Mode 1 (Repeating). Redstone 0. Conditional 1.
        const packet = new CommandBlockUpdatePacket(
            Buffer.concat([Buffer.from([0x4e, 0x01, 0x02, 0x04, 0x06, 0x01, 0x00, 0x01]), tail])
        );
        packet.decode();

        expect(packet.target).toEqual({
            isBlock: true,
            blockPosition: new BlockPosition(1, 2, 3),
            commandBlockMode: CommandBlockMode.Repeating,
            redstoneMode: false,
            isConditional: true
        });
        expect(packet.command).toBe('say');
        expect(packet.lastOutput).toBe('');
        expect(packet.name).toBe('n');
        expect(packet.filteredName).toBe('');
        expect(packet.trackOutput).toBe(true);
        expect(packet.tickDelay).toBe(20);
        expect(packet.executeOnFirstTick).toBe(false);
        expect(packet.feof()).toBe(true);
    });

    it('decodes an entity target as selector 0 and a varuint64 runtime id', () => {
        const packet = new CommandBlockUpdatePacket(Buffer.concat([Buffer.from([0x4e, 0x00, 0x80, 0x01]), tail]));
        packet.decode();

        expect(packet.target).toEqual({ isBlock: false, targetRuntimeId: 128n });
        expect(packet.feof()).toBe(true);
    });

    it('rejects an unknown target alternative', () => {
        const packet = new CommandBlockUpdatePacket(Buffer.concat([Buffer.from([0x4e, 0x02]), tail]));

        expect(() => packet.decode()).toThrow(/alternative 2/);
    });

    it('encodes a block target back to the same bytes', () => {
        const packet = new CommandBlockUpdatePacket();
        packet.target = {
            isBlock: true,
            blockPosition: new BlockPosition(1, 2, 3),
            commandBlockMode: CommandBlockMode.Repeating,
            redstoneMode: false,
            isConditional: true
        };
        packet.command = 'say';
        packet.name = 'n';
        packet.trackOutput = true;
        packet.tickDelay = 20;
        packet.encode();

        expect(packet.getBuffer()).toEqual(
            Buffer.concat([Buffer.from([0x4e, 0x01, 0x02, 0x04, 0x06, 0x01, 0x00, 0x01]), tail])
        );
    });
});
