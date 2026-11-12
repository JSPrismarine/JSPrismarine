import { afterEach, describe, expect, it, vi } from 'vitest';

import { CommandParameterFlags, CommandParameterTypeFlag } from '../wire/structures/CommandParameter';
import { CommandEnum } from '../wire/structures/CommandEnum';
import CommandEnumConstraint from '../wire/structures/CommandEnumConstraint';
import AvailableCommandsPacket from './AvailableCommandsPacket';

const identifier = 'name\r\n[INFO] forged\t\b\u001b[2J\u0085\u2028\u2029"\\';
const quotedIdentifier = '"name\\r\\n[INFO] forged\\t\\b\\u001b[2J\\u0085\\u2028\\u2029\\"\\\\"';

const writeString = (packet: AvailableCommandsPacket, value: string): void => {
    const bytes = Buffer.from(value);
    packet.writeUnsignedVarInt(bytes.length);
    packet.write(bytes);
};

const malformedPacket = (kind: string): AvailableCommandsPacket => {
    const body = new AvailableCommandsPacket();
    body.writeUnsignedVarInt(0); // Enum values.
    body.writeUnsignedVarInt(0); // Chained values.
    body.writeUnsignedVarInt(0); // Postfixes.
    body.writeUnsignedVarInt(kind === 'enum value' ? 1 : 0);
    if (kind === 'enum value') {
        writeString(body, identifier);
        body.writeUnsignedVarInt(1);
        body.writeUnsignedIntLE(0);
    }
    body.writeUnsignedVarInt(kind === 'chained value' ? 1 : 0);
    if (kind === 'chained value') {
        writeString(body, identifier);
        body.writeUnsignedVarInt(1);
        body.writeUnsignedVarInt(0);
        body.writeUnsignedVarInt(0);
    }
    body.writeUnsignedVarInt(1); // Commands.
    writeString(body, identifier);
    writeString(body, 'description');
    body.writeUnsignedShortLE(0);
    writeString(body, 'any');
    body.writeIntLE(-1);
    body.writeUnsignedVarInt(kind === 'command subcommand' ? 1 : 0);
    if (kind === 'command subcommand') body.writeUnsignedIntLE(0);
    body.writeUnsignedVarInt(1); // Overloads.
    body.writeBoolean(false);
    body.writeUnsignedVarInt(1); // Parameters.
    writeString(body, identifier);
    const types: Record<string, number> = {
        'parameter subcommand': CommandParameterTypeFlag.Enum,
        'parameter enum': CommandParameterTypeFlag.Enum,
        postfix: CommandParameterTypeFlag.Postfix,
        'parse symbol': 0,
        'soft enum': CommandParameterTypeFlag.SoftEnum
    };
    body.writeUnsignedIntLE(types[kind] ?? 0);
    body.writeBoolean(false);
    body.writeByte(kind === 'parameter subcommand' ? CommandParameterFlags.ENUM_AS_CHAINED_COMMAND : 0);
    body.writeUnsignedVarInt(0); // Soft enums.
    body.writeUnsignedVarInt(0); // Constraints.
    return new AvailableCommandsPacket(body.getWriteBuffer());
};

describe('AvailableCommandsPacket diagnostics', () => {
    it.each([
        ['enum value', 'Enum', 'points at missing enum value 0'],
        ['chained value', 'Subcommand', 'points at missing value 0'],
        ['command subcommand', 'Command', 'points at missing subcommand table 0'],
        ['parameter subcommand', 'Parameter', 'points at missing subcommand table 0'],
        ['parameter enum', 'Parameter', 'points at missing enum 0'],
        ['postfix', 'Parameter', 'points at missing postfix 0'],
        ['parse symbol', 'Parameter', 'carries unknown parse symbol 0'],
        ['soft enum', 'Parameter', 'points at missing soft enum 0']
    ])('escapes the wire identifier for an invalid %s', (kind, label, detail) => {
        const packet = malformedPacket(kind);
        expect(() => packet.decodePayload()).toThrow(`${label} ${quotedIdentifier} ${detail}`);
    });
});

const hardEnum = (name: string, values: string[]): CommandEnum =>
    Object.assign(new CommandEnum(), { name, values, soft: false });

/** Encodes `packet` and decodes the bytes into a fresh packet. */
const roundTrip = (packet: AvailableCommandsPacket): AvailableCommandsPacket => {
    packet.encode();
    const decoded = new AvailableCommandsPacket(packet.getBuffer());
    decoded.decode();
    return decoded;
};

describe('AvailableCommandsPacket', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('resolves each constraint to its value in the constrained enum', () => {
        const gameModes = hardEnum('GameMode', ['survival', 'creative', 'adventure']);
        const difficulty = hardEnum('Difficulty', ['peaceful', 'easy', 'creative']);
        const packet = new AvailableCommandsPacket();
        packet.hardcodedEnums = [gameModes, difficulty];
        packet.enumConstraints = [
            new CommandEnumConstraint(gameModes, 1, [1]),
            new CommandEnumConstraint(gameModes, 2, [0, 2]),
            new CommandEnumConstraint(difficulty, 2, [1])
        ];

        const decoded = roundTrip(packet).enumConstraints;

        expect(decoded.map((c) => [c.getEnum().name, c.getValueOffset(), c.getConstraints()])).toEqual([
            ['GameMode', 1, [1]],
            ['GameMode', 2, [0, 2]],
            ['Difficulty', 2, [1]]
        ]);
    });

    it('does not search the enum once per constraint', () => {
        const values = Array.from({ length: 64 }, (_, i) => `value${i}`);
        const big = hardEnum('Big', values);
        const packet = new AvailableCommandsPacket();
        packet.hardcodedEnums = [big];
        packet.enumConstraints = values.map((_, offset) => new CommandEnumConstraint(big, offset, [0]));
        packet.encode();
        const decoded = new AvailableCommandsPacket(packet.getBuffer());

        const indexOf = vi.spyOn(Array.prototype, 'indexOf');
        decoded.decode();
        const scansOfTheEnum = indexOf.mock.contexts.filter((array) => Array.isArray(array) && array.length >= 64);
        indexOf.mockRestore();

        expect(scansOfTheEnum).toHaveLength(0);
        expect(decoded.enumConstraints.map((c) => c.getValueOffset())).toEqual(values.map((_, i) => i));
    });
});
