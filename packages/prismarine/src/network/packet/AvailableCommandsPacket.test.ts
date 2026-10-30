import BinaryStream from '@jsprismarine/binaryutils';
import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import type SessionManager from '../../SessionManager';
import { CommandManager } from '../../command/CommandManager';
import type { Config } from '../../config/Config';
import type { PermissionManager } from '../../permission/PermissionManager';
import { stub } from '../../testing/stub.test.helper';
import type ClientConnection from '../ClientConnection';
import { NetworkUtil } from '../NetworkUtil';
import PlayerSession from '../PlayerSession';
import { CommandChainedSubcommand } from '@jsprismarine/protocol/wire/structures/CommandChainedSubcommand';
import CommandData from '@jsprismarine/protocol/wire/structures/CommandData';
import { CommandEnum } from '@jsprismarine/protocol/wire/structures/CommandEnum';
import CommandEnumConstraint from '@jsprismarine/protocol/wire/structures/CommandEnumConstraint';
import CommandParameter, {
    CommandArgumentType,
    CommandParameterType
} from '@jsprismarine/protocol/wire/structures/CommandParameter';
import AvailableCommandsPacket from '@jsprismarine/protocol/packet/AvailableCommandsPacket';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import { testContent } from '../../testing/entityServer';

/**
 * Reads the packet back the way a protocol 2193 client does, from the docs'
 * `AvailableCommandsPacketPayload` and gophertunnel's `protocol/command.go` at 1.26.50. Written
 * by hand rather than with a decoder of the packet's own, so the layout is pinned to the
 * protocol and not to the writer. Fails unless the packet ends exactly where the schema does.
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
        const aliasesOffset = stream.readIntLE();
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

const makeChainedSubcommand = (name: string, values: string[]): CommandChainedSubcommand => {
    const result = new CommandChainedSubcommand();
    result.name = name;
    result.values = values;
    return result;
};

/** A varuint length and the UTF-8 bytes. */
const text = (value: string): number[] => {
    const bytes = Buffer.from(value, 'utf8');
    return [bytes.byteLength, ...bytes];
};

/** A uint32, little endian. */
const u32 = (value: number): number[] => [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff
];

// The flag bits and type ids of gophertunnel's `protocol/command.go` at protocol 2193, as
// literals so the test does not trust the constants it is checking.
const VALID = 0x100000;
const ENUM = 0x200000;
const POSTFIX = 0x1000000;
const SOFT_ENUM = 0x4000000;

/**
 * The basic argument type ids of protocol 2193 that a plain parameter may carry. The low 16
 * bits of a parameter's `Parse Symbol` once its flags are masked off.
 *
 * Read off {@link CommandArgumentType} rather than listed, so a type the command layer starts
 * sending is checked against the table the packet writes from instead of against a copy of it.
 */
const ARGUMENT_TYPE_IDS = new Set(Object.values(CommandArgumentType).filter((id) => typeof id === 'number'));

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
                new CommandParameter({ paramName: 'tag', enum: tags }),
                new CommandParameter({ paramName: 'ticks', paramType: CommandParameterType.Int, postfix: 't' })
            ]
        ];

        const packet = new AvailableCommandsPacket();
        packet.softEnums = [players];
        packet.commandData = [command];

        const decoded = readBack(encode(packet));

        expect(decoded.enumValues).toEqual(['teleport', 'tp', 'survival', 'creative']);
        expect(decoded.chainedSubcommandValues).toEqual([]);
        expect(decoded.suffixes).toEqual(['t']);
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
                            { name: 'tag', type: SOFT_ENUM | VALID | 1, optional: false, options: 0 },
                            { name: 'ticks', type: POSTFIX | 0, optional: false, options: 0 }
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
                aliasesOffset: -1,
                chainedSubcommandOffsets: [],
                overloads: []
            }
        ]);
        expect(decoded.dynamicEnums).toEqual([]);
    });

    it('matches the protocol 2193 bytes for a command with an alias enum and an enum parameter', () => {
        const command = new CommandData();
        command.commandName = 'gamemode';
        command.commandDescription = 'Sets the game mode.';
        command.permission = 1;
        command.aliases = makeEnum('gamemodeAliases', ['gm', 'gamemode']);
        command.overloads = [
            [
                new CommandParameter({ paramName: 'mode', enum: makeEnum('GameMode', ['survival', 'creative']) }),
                new CommandParameter({ paramName: 'player', paramType: CommandParameterType.Int, isOptional: true })
            ]
        ];

        const packet = new AvailableCommandsPacket();
        packet.commandData = [command];

        expect([...encode(packet)]).toEqual([
            0x4c,
            // Enum Values.
            4,
            ...text('gm'),
            ...text('gamemode'),
            ...text('survival'),
            ...text('creative'),
            // Chained Subcommand Values, Post Fixes.
            0,
            0,
            // Enum Data: a name and uint32 indices into Enum Values.
            2,
            ...text('gamemodeAliases'),
            2,
            ...u32(0),
            ...u32(1),
            ...text('GameMode'),
            2,
            ...u32(2),
            ...u32(3),
            // Chained Subcommand Data.
            0,
            // Commands.
            1,
            ...text('gamemode'),
            ...text('Sets the game mode.'),
            0x00,
            0x00, // Flags, uint16.
            ...text('gamedirectors'), // Permission Level, a string.
            ...u32(0), // Alias Enum, int32.
            0, // CommandData Chained Subcommand Indexes.
            1, // Overloads.
            0, // isChaining.
            2, // Parameter Data.
            ...text('mode'),
            ...u32(ENUM | VALID | 1),
            0,
            0,
            ...text('player'),
            ...u32(VALID | 1),
            1,
            0,
            // Soft Enums, Constraints.
            0,
            0
        ]);
    });

    it('writes the chained subcommand tables a /execute overload chain needs', () => {
        // Mojang's own `/execute`: every subcommand keyword is a one-value hard enum, the
        // tail of a chaining overload is the `EXECUTECHAINEDOPTION_0` table, and the tail is
        // optional exactly on the `if`/`unless` overloads, which run on their own.
        const chained = makeChainedSubcommand('EXECUTECHAINEDOPTION_0', ['as', 'if', 'unless', 'run']);

        const command = new CommandData();
        command.commandName = 'execute';
        command.commandDescription = 'Executes a command.';
        command.permission = 1;
        command.chainedSubcommands = [chained];
        command.overloads = [
            [
                new CommandParameter({ paramName: 'as', enum: makeEnum('OPTION_AS', ['as']) }),
                new CommandParameter({ paramName: 'origin', paramType: CommandParameterType.Target }),
                new CommandParameter({ paramName: 'chainedCommand', chainedSubcommand: chained })
            ],
            [
                new CommandParameter({ paramName: 'ifUnless', enum: makeEnum('OPTION_IF_UNLESS', ['if', 'unless']) }),
                new CommandParameter({ paramName: 'entity', enum: makeEnum('OPTION_ENTITY', ['entity']) }),
                new CommandParameter({ paramName: 'target', paramType: CommandParameterType.Target }),
                new CommandParameter({ paramName: 'chainedCommand', chainedSubcommand: chained, isOptional: true })
            ],
            [
                new CommandParameter({ paramName: 'run', enum: makeEnum('OPTION_RUN', ['run']) }),
                new CommandParameter({ paramName: 'command', paramType: CommandParameterType.CodeBuilderArgs })
            ]
        ];

        const packet = new AvailableCommandsPacket();
        packet.commandData = [command];

        const decoded = readBack(encode(packet));

        expect(decoded.chainedSubcommandValues).toEqual(['as', 'if', 'unless', 'run']);
        // Mojang's schema names the pair `first` and `second` and defines neither. The only
        // datum the table has per entry is the keyword, so its index goes in both.
        expect(decoded.chainedSubcommands).toEqual([
            {
                name: 'EXECUTECHAINEDOPTION_0',
                values: [
                    { index: 0, value: 0 },
                    { index: 1, value: 1 },
                    { index: 2, value: 2 },
                    { index: 3, value: 3 }
                ]
            }
        ]);

        const [written] = decoded.commands;
        expect(written?.chainedSubcommandOffsets).toEqual([0]);
        expect(written?.overloads.map(({ chaining }) => chaining)).toEqual([true, true, false]);
        // A chained parameter indexes `Chained Subcommand Data`, not `Enum Data`, with the
        // same enum flags. `EnumAsChainedCommand` is the bit that tells the two apart.
        expect(written?.overloads[0]?.parameters[2]).toEqual({
            name: 'chainedCommand',
            type: ENUM | VALID | 0,
            optional: false,
            options: 4
        });
        expect(written?.overloads[1]?.parameters[3]).toEqual({
            name: 'chainedCommand',
            type: ENUM | VALID | 0,
            optional: true,
            options: 4
        });
    });

    it("sends the server's default command set in a form a 2193 reader decodes to the end", async () => {
        const sent: NetworkPacket[] = [];
        const players: Player[] = [];
        const logger = stub<Logger>({ verbose() {}, debug() {}, info() {}, warn() {}, error() {} });
        const server = stub<Server>({
            emit: async () => {},
            getLogger: () => logger,
            // No pack stack, so the command layer offers the commands a server without one has.
            getContent: () => testContent(),
            getSessionManager: () => stub<SessionManager>({ getAllPlayers: () => players }),
            getPermissionManager: () =>
                stub<PermissionManager>({
                    can: () => ({ execute: () => true, not: () => ({ execute: () => false }) })
                }),
            getCommandManager: () => commandManager,
            // Read once by the session's constructor.
            getConfig: () =>
                stub<Config>({
                    getProximityBroadcast: () => false,
                    getEntityTrackingHysteresis: () => 2,
                    getEntityTrackingInterval: () => 4
                })
        });
        const commandManager = new CommandManager(server);
        await commandManager.enable();

        const player = stub<Player>({ getName: () => 'Steve', getServer: () => server, isOp: () => false });
        players.push(player);
        const connection = stub<ClientConnection>({
            sendDataPacket: async (packet) => {
                sent.push(packet);
            }
        });

        await new PlayerSession(server, connection, player).sendAvailableCommands();

        const [packet] = sent;
        expect(packet).toBeInstanceOf(AvailableCommandsPacket);
        if (!(packet instanceof AvailableCommandsPacket)) return;

        const decoded = readBack(encode(packet));

        expect(decoded.commands.length).toBeGreaterThan(0);
        for (const command of decoded.commands) {
            expect(command.permission).toBe('any');
            if (command.aliasesOffset !== -1) {
                expect(decoded.enums[command.aliasesOffset]?.type).toBe(`${command.name}Aliases`);
            }
            for (const overload of command.overloads) {
                for (const parameter of overload.parameters) {
                    const index = parameter.type & 0xffff;
                    if (parameter.type & ENUM) {
                        expect(parameter.type & VALID).toBe(VALID);
                        expect(index).toBeLessThan(decoded.enums.length);
                    } else if (parameter.type & SOFT_ENUM) {
                        expect(parameter.type & VALID).toBe(VALID);
                        expect(index).toBeLessThan(decoded.dynamicEnums.length);
                    } else if (parameter.type & POSTFIX) {
                        expect(index).toBeLessThan(decoded.suffixes.length);
                    } else {
                        expect(parameter.type & VALID).toBe(VALID);
                        expect(ARGUMENT_TYPE_IDS.has(index), `${command.name} ${parameter.name} ${index}`).toBe(true);
                    }
                }
            }
        }
        for (const { valueIndices } of decoded.enums) {
            for (const index of valueIndices) expect(index).toBeLessThan(decoded.enumValues.length);
        }
    });

    it('round-trips a command with every parameter kind, a constraint and a chained subcommand', () => {
        const players = makeEnum('Player', ['Steve'], true);
        const gameModes = makeEnum('GameMode', ['survival', 'creative']);
        const chain = makeChainedSubcommand('EXECUTECHAINEDOPTION_0', ['as', 'at', 'run']);

        const command = new CommandData();
        command.commandName = 'tp';
        command.commandDescription = 'Teleports.';
        command.flags = 0x30;
        command.permission = 2;
        command.aliases = makeEnum('tpAliases', ['teleport', 'tp']);
        command.chainedSubcommands = [chain];
        command.overloads = [
            [
                new CommandParameter({ paramName: 'name', paramType: CommandParameterType.String }),
                new CommandParameter({ paramName: 'pos', paramType: CommandParameterType.Position, isOptional: true }),
                new CommandParameter({ paramName: 'mode', enum: gameModes }),
                new CommandParameter({ paramName: 'player', enum: players }),
                new CommandParameter({ paramName: 'ticks', paramType: CommandParameterType.Int, postfix: 't' }),
                new CommandParameter({ paramName: 'then', chainedSubcommand: chain })
            ]
        ];

        const packet = new AvailableCommandsPacket();
        packet.hardcodedEnums = [gameModes];
        packet.softEnums = [players];
        packet.commandData = [command];
        packet.enumConstraints = [new CommandEnumConstraint(gameModes, 1, [1])];
        const buffer = encode(packet);

        const decoded = new AvailableCommandsPacket(buffer);
        decoded.decode();

        expect(decoded.commandData).toHaveLength(1);
        const read = decoded.commandData[0]!;
        expect(read.commandName).toBe('tp');
        expect(read.commandDescription).toBe('Teleports.');
        expect(read.flags).toBe(0x30);
        expect(read.permission).toBe(2);
        expect(read.aliases?.name).toBe('tpAliases');
        expect(read.aliases?.values).toEqual(['teleport', 'tp']);
        expect(read.chainedSubcommands.map((table) => table.name)).toEqual(['EXECUTECHAINEDOPTION_0']);
        expect(read.chainedSubcommands[0]!.values).toEqual(['as', 'at', 'run']);

        expect(read.overloads).toHaveLength(1);
        const [name, pos, mode, player, ticks, then] = read.overloads[0]!;
        expect(name!.paramName).toBe('name');
        expect(name!.paramType).toBe(CommandParameterType.String);
        expect(pos!.paramType).toBe(CommandParameterType.Position);
        expect(pos!.isOptional).toBe(true);
        expect(mode!.enum?.name).toBe('GameMode');
        expect(mode!.enum?.soft).toBe(false);
        expect(player!.enum?.name).toBe('Player');
        expect(player!.enum?.soft).toBe(true);
        expect(player!.enum?.values).toEqual(['Steve']);
        expect(ticks!.postfix).toBe('t');
        expect(then!.chainedSubcommand?.name).toBe('EXECUTECHAINEDOPTION_0');
        expect(then!.flags).toBe(0);

        expect(decoded.softEnums.map((softEnum) => softEnum.name)).toEqual(['Player']);
        expect(decoded.enumConstraints).toHaveLength(1);
        expect(decoded.enumConstraints[0]!.getEnum().name).toBe('GameMode');
        expect(decoded.enumConstraints[0]!.getAffectedValue()).toBe('creative');
        expect(decoded.enumConstraints[0]!.getConstraints()).toEqual([1]);
        expect(decoded.feof()).toBe(true);

        // A decoded packet re-encodes to the same bytes: the tables rebuild in the same order.
        const reencoded = new AvailableCommandsPacket();
        reencoded.hardcodedEnums = decoded.hardcodedEnums;
        reencoded.softEnums = decoded.softEnums;
        reencoded.commandData = decoded.commandData;
        reencoded.enumConstraints = decoded.enumConstraints;
        expect(encode(reencoded)).toEqual(buffer);
    });
});
