import { describe, expect, it } from 'vitest';

import AvailableCommandsPacket from './AvailableCommandsPacket';
import { CommandParameterFlags, CommandParameterTypeFlag } from '../wire/structures/CommandParameter';

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
