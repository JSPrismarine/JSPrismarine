import BinaryStream from '@jsprismarine/binaryutils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { availableCommandsPacket } from '../wire/definitions/availableCommands';
import { layoutAt } from '../wire/WireLayout';
import CommandParameter, {
    CommandParameterFlags,
    CommandParameterType,
    CommandParameterTypeFlag
} from '../wire/structures/CommandParameter';
import { CommandEnum } from '../wire/structures/CommandEnum';
import { CommandChainedSubcommand } from '../wire/structures/CommandChainedSubcommand';
import CommandData from '../wire/structures/CommandData';
import CommandEnumConstraint from '../wire/structures/CommandEnumConstraint';
import AvailableCommandsPacket from './AvailableCommandsPacket';
import { capture } from '../testing/evidence.test.helper';

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

describe('AvailableCommandsPacket against the real server', () => {
    for (const protocolVersion of [2193, 2225]) {
        // `0x4c.bin` is the payload a Bedrock Dedicated Server sent at login, without the packet id.
        const captured = capture(protocolVersion, 0x4c);

        it(`round-trips the captured payload byte for byte at protocol ${protocolVersion}`, () => {
            const layout = layoutAt(availableCommandsPacket, protocolVersion);
            const stream = new BinaryStream(captured);
            const payload = layout.decode(stream);
            expect(stream.feof()).toBe(true);

            const encoded = new BinaryStream();
            layout.encode(encoded, payload);
            expect(encoded.getBuffer().equals(captured)).toBe(true);
        });

        it(`decodes the captured packet through the class at protocol ${protocolVersion}`, () => {
            const packet = new AvailableCommandsPacket(Buffer.concat([Buffer.from([0x4c]), captured]));
            packet.decode({ protocolVersion });

            const run = packet.commandData
                .find((command) => command.commandName === 'execute')
                ?.overloads.find((overload) => overload[0]?.enum?.values.includes('run'));
            expect(run?.[1]?.paramName).toBe('command');
            expect(run?.[1]?.paramType).toBe(CommandParameterType.CodeBuilderArgs);
        });

        it(`marks the overloads chaining where the capture does at protocol ${protocolVersion}`, () => {
            const layout = layoutAt(availableCommandsPacket, protocolVersion);
            const flags = (payload: ReturnType<typeof layout.decode>) =>
                payload.commands.map((command) => [command.name, command.overloads.map((o) => o.isChaining)]);

            const packet = new AvailableCommandsPacket(Buffer.concat([Buffer.from([0x4c]), captured]));
            packet.decode({ protocolVersion });
            const sent = new AvailableCommandsPacket();
            sent.commandData = packet.commandData;
            sent.encode({ protocolVersion });

            const original = layout.decode(new BinaryStream(captured));
            // `/execute run <command>` ends in no chained parameter, and the server still marks it.
            const execute = original.commands.find((command) => command.name === 'execute');
            expect(execute?.overloads.at(-1)?.isChaining).toBe(true);
            expect(flags(layout.decode(new BinaryStream(sent.getBuffer().subarray(1))))).toEqual(flags(original));
        });

        it(`writes the permission levels as the lower case names the real server sends at protocol ${protocolVersion}`, () => {
            const layout = layoutAt(availableCommandsPacket, protocolVersion);
            const capturedNames = new Set(
                layout.decode(new BinaryStream(captured)).commands.map((command) => command.permissionLevel)
            );
            expect([...capturedNames].sort()).toEqual(['admin', 'any', 'gamedirectors', 'host', 'owner']);

            const sent = new AvailableCommandsPacket();
            sent.commandData = [0, 1, 2, 3, 4].map((permission) =>
                Object.assign(new CommandData(), { commandName: `c${permission}`, permission })
            );
            sent.encode({ protocolVersion });
            const written = layout.decode(new BinaryStream(sent.getBuffer().subarray(1)));
            expect(written.commands.map((command) => command.permissionLevel).sort()).toEqual(
                [...capturedNames].sort()
            );
        });

        it(`gives each chained keyword its enum and the chained parameter its flag, as the capture does at protocol ${protocolVersion}`, () => {
            const layout = layoutAt(availableCommandsPacket, protocolVersion);
            const original = layout.decode(new BinaryStream(captured));
            const holds = (payload: typeof original, second: number, keyword: string) =>
                payload.enums[second]?.values.map((index) => payload.enumValues[index]).includes(keyword);

            // The capture: `second` is the `Enum Data` index of an enum holding the keyword, and an
            // `/execute` overload ends in the `Chained` word with the `EnumAsChainedCommand` option.
            const [captureTable] = original.chainedSubcommands;
            expect(captureTable?.values.length).toBeGreaterThan(0);
            for (const { first, second } of captureTable?.values ?? []) {
                expect(holds(original, second, original.chainedSubcommandValues[first] ?? '')).toBe(true);
            }
            const tailOf = (payload: typeof original) =>
                payload.commands
                    .find((command) => command.name === 'execute')
                    ?.overloads.map(({ parameters }) => parameters.at(-1)) ?? [];
            expect(tailOf(original)[0]?.parseSymbol).toBe(
                CommandParameterTypeFlag.Chained | CommandParameterTypeFlag.Valid
            );
            expect(tailOf(original)[0]?.options).toBe(CommandParameterFlags.ENUM_AS_CHAINED_COMMAND);

            // Our encoder writes the same shape for a command built the way `/execute` is.
            const table = Object.assign(new CommandChainedSubcommand(), {
                name: 'ExecuteChainedOption_0',
                values: ['as', 'if', 'unless', 'run']
            });
            const keywordParameter = (name: string, values: string[]) =>
                new CommandParameter({ paramName: 'subcommand', enum: hardEnum(name, values) });
            const command = Object.assign(new CommandData(), {
                commandName: 'execute',
                chainedSubcommands: [table],
                overloads: [
                    [keywordParameter('Option_As', ['as']), new CommandParameter({ chainedSubcommand: table })],
                    [
                        keywordParameter('Option_If_Unless', ['if', 'unless']),
                        new CommandParameter({ chainedSubcommand: table })
                    ],
                    [keywordParameter('Option_Run', ['run']), new CommandParameter({ chainedSubcommand: table })]
                ]
            });
            const sent = new AvailableCommandsPacket();
            sent.commandData = [command];
            sent.encode({ protocolVersion });
            const written = layout.decode(new BinaryStream(sent.getBuffer().subarray(1)));

            const [writtenTable] = written.chainedSubcommands;
            expect(writtenTable?.values).toHaveLength(4);
            for (const { first, second } of writtenTable?.values ?? []) {
                const keyword = written.chainedSubcommandValues[first] ?? '';
                expect(holds(written, second, keyword), `keyword ${keyword}`).toBe(true);
            }
            expect(tailOf(written).map((parameter) => parameter?.parseSymbol)).toEqual([
                CommandParameterTypeFlag.Chained | CommandParameterTypeFlag.Valid,
                CommandParameterTypeFlag.Chained | CommandParameterTypeFlag.Valid,
                CommandParameterTypeFlag.Chained | CommandParameterTypeFlag.Valid
            ]);
            expect(tailOf(written).map((parameter) => parameter?.options)).toEqual([4, 4, 4]);

            // And it reads that back to the same table.
            const received = new AvailableCommandsPacket(sent.getBuffer());
            received.decode();
            expect(received.commandData[0]?.overloads[1]?.[1]?.chainedSubcommand?.values).toEqual([
                'as',
                'if',
                'unless',
                'run'
            ]);
        });
    }
});
