import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';

import { NetworkUtil } from '../NetworkUtil';
import CommandData from '../type/CommandData';
import { CommandEnum } from '../type/CommandEnum';
import CommandParameter, { CommandParameterType } from '../type/CommandParameter';
import AvailableCommandsPacket from './AvailableCommandsPacket';

/**
 * Reads the packet back the way a client of protocol 2193 does, from gophertunnel's
 * `packet/available_commands.go` and `protocol/command.go`. Written by hand rather than with
 * a decoder of the packet's own, so that the layout is pinned to the protocol and not to the
 * writer.
 */
const readBack = (buffer: Buffer) => {
    const stream = new BinaryStream(buffer);
    expect(stream.readUnsignedVarInt()).toBe(0x4c); // Header.

    const readStrings = () => {
        const strings = [];
        for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) {
            strings.push(NetworkUtil.readString(stream));
        }
        return strings;
    };

    const enumValues = readStrings();
    const chainedSubcommandValues = readStrings();
    const suffixes = readStrings();

    const enums = [];
    for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) {
        const type = NetworkUtil.readString(stream);
        const valueIndices = [];
        for (let j = 0, n = stream.readUnsignedVarInt(); j < n; j++) {
            valueIndices.push(stream.readUnsignedIntLE());
        }
        enums.push({ type, valueIndices });
    }

    const chainedSubcommands = [];
    for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) {
        const name = NetworkUtil.readString(stream);
        const values = [];
        for (let j = 0, n = stream.readUnsignedVarInt(); j < n; j++) {
            values.push({ index: stream.readUnsignedVarInt(), value: stream.readUnsignedVarInt() });
        }
        chainedSubcommands.push({ name, values });
    }

    const commands = [];
    for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) {
        const name = NetworkUtil.readString(stream);
        const description = NetworkUtil.readString(stream);
        const flags = stream.readUnsignedShortLE();
        const permission = NetworkUtil.readString(stream);
        const aliasesOffset = stream.readUnsignedIntLE();
        const chainedSubcommandOffsets = [];
        for (let j = 0, n = stream.readUnsignedVarInt(); j < n; j++) {
            chainedSubcommandOffsets.push(stream.readUnsignedIntLE());
        }
        const overloads = [];
        for (let j = 0, n = stream.readUnsignedVarInt(); j < n; j++) {
            const chaining = stream.readBoolean();
            const parameters = [];
            for (let k = 0, m = stream.readUnsignedVarInt(); k < m; k++) {
                parameters.push({
                    name: NetworkUtil.readString(stream),
                    type: stream.readUnsignedIntLE(),
                    optional: stream.readBoolean(),
                    options: stream.readByte()
                });
            }
            overloads.push({ chaining, parameters });
        }
        commands.push({ name, description, flags, permission, aliasesOffset, chainedSubcommandOffsets, overloads });
    }

    const dynamicEnums = [];
    for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) {
        dynamicEnums.push({ type: NetworkUtil.readString(stream), values: readStrings() });
    }

    const constraints = [];
    for (let i = 0, count = stream.readUnsignedVarInt(); i < count; i++) {
        const enumValueIndex = stream.readUnsignedIntLE();
        const enumIndex = stream.readUnsignedIntLE();
        const bytes = [];
        for (let j = 0, n = stream.readUnsignedVarInt(); j < n; j++) {
            bytes.push(stream.readByte());
        }
        constraints.push({ enumValueIndex, enumIndex, constraints: bytes });
    }

    expect(stream.feof()).toBe(true);
    return {
        enumValues,
        chainedSubcommandValues,
        suffixes,
        enums,
        chainedSubcommands,
        commands,
        dynamicEnums,
        constraints
    };
};

const encode = (packet: AvailableCommandsPacket): Buffer => {
    packet.encode();
    return packet.getBuffer();
};

const makeEnum = (name: string, values: string[], soft = false): CommandEnum => {
    const result = new CommandEnum();
    result.name = name;
    result.values = values;
    result.soft = soft;
    return result;
};

// The flag bits and type ids of gophertunnel's `protocol/command.go` at protocol 2193, as
// literals so the test does not trust the constants it is checking.
const VALID = 0x100000;
const ENUM = 0x200000;
const SOFT_ENUM = 0x4000000;

describe('AvailableCommandsPacket', () => {
    it('writes one command with every parameter kind in protocol 2193 order', () => {
        const players = makeEnum('Player', ['Steve'], true);
        const tags = makeEnum('Tag', ['builder'], true);
        const gameModes = makeEnum('GameMode', ['survival', 'creative']);

        const command = new CommandData();
        command.commandName = 'tp';
        command.commandDescription = 'Teleports.';
        command.aliases = makeEnum('tpAliases', ['teleport', 'tp']);
        command.overloads = [
            [
                new CommandParameter({ paramName: 'name', paramType: CommandParameterType.String }),
                new CommandParameter({ paramName: 'count', paramType: CommandParameterType.Int }),
                new CommandParameter({ paramName: 'target', paramType: CommandParameterType.Target }),
                new CommandParameter({ paramName: 'pos', paramType: CommandParameterType.Position, isOptional: true }),
                new CommandParameter({ paramName: 'mode', enum: gameModes }),
                new CommandParameter({ paramName: 'player', enum: players }),
                new CommandParameter({ paramName: 'tag', enum: tags })
            ]
        ];

        const packet = new AvailableCommandsPacket();
        packet.softEnums = [players];
        packet.commandData = [command];

        const decoded = readBack(encode(packet));

        expect(decoded.enumValues).toEqual(['teleport', 'tp', 'survival', 'creative']);
        expect(decoded.chainedSubcommandValues).toEqual([]);
        expect(decoded.suffixes).toEqual([]);
        expect(decoded.enums).toEqual([
            { type: 'tpAliases', valueIndices: [0, 1] },
            { type: 'GameMode', valueIndices: [2, 3] }
        ]);
        expect(decoded.chainedSubcommands).toEqual([]);
        expect(decoded.commands).toEqual([
            {
                name: 'tp',
                description: 'Teleports.',
                flags: 0,
                permission: 'any',
                aliasesOffset: 0,
                chainedSubcommandOffsets: [],
                overloads: [
                    {
                        chaining: false,
                        parameters: [
                            { name: 'name', type: VALID | 56, optional: false, options: 0 },
                            { name: 'count', type: VALID | 1, optional: false, options: 0 },
                            { name: 'target', type: VALID | 8, optional: false, options: 0 },
                            { name: 'pos', type: VALID | 65, optional: true, options: 0 },
                            { name: 'mode', type: ENUM | VALID | 1, optional: false, options: 0 },
                            { name: 'player', type: SOFT_ENUM | VALID | 0, optional: false, options: 0 },
                            { name: 'tag', type: SOFT_ENUM | VALID | 1, optional: false, options: 0 }
                        ]
                    }
                ]
            }
        ]);
        // Soft enums are their own table: the one only a parameter named is written too, at the
        // index the parameter points at.
        expect(decoded.dynamicEnums).toEqual([
            { type: 'Player', values: ['Steve'] },
            { type: 'Tag', values: ['builder'] }
        ]);
        expect(decoded.constraints).toEqual([]);
    });

    it('writes a command without aliases or overloads', () => {
        const command = new CommandData();
        command.commandName = 'list';
        command.commandDescription = 'Lists players.';
        command.permission = 1;

        const packet = new AvailableCommandsPacket();
        packet.commandData = [command];

        const decoded = readBack(encode(packet));

        expect(decoded.enums).toEqual([]);
        expect(decoded.commands).toEqual([
            {
                name: 'list',
                description: 'Lists players.',
                flags: 0,
                permission: 'gamedirectors',
                aliasesOffset: 0xffffffff,
                chainedSubcommandOffsets: [],
                overloads: []
            }
        ]);
        expect(decoded.dynamicEnums).toEqual([]);
    });
});
