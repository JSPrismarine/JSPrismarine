import { argument as sourcelessArgument, literal } from '@jsprismarine/brigadier';
import type { ArgumentType } from '@jsprismarine/brigadier';
import { CommandPermissionLevel } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import {
    entityArgument,
    enumArgument,
    integerArgument,
    nbtPathArgument,
    postfixIntegerArgument,
    softEnumArgument
} from './argumentTypes';
import { ParameterOption, ParameterTypeFlag } from './parameterTypes';
import type { AvailableCommandsPayload } from './packet';
import { buildAvailableCommands } from './packet';
import { CommandRegistry } from './tree';

interface TestSource {
    readonly level: number;
}

/**
 * `argument`, bound to this file's source type.
 *
 * `argument` cannot infer the source from its own parameters, so bare calls build a node over
 * `unknown` that will not compose with the literals around it.
 */
const argument = <T>(name: string, type: ArgumentType<T>) => sourcelessArgument<TestSource, T>(name, type);

const succeed = () => 1;

const buildRegistry = () => {
    const registry = new CommandRegistry<TestSource>();

    registry.register(
        literal<TestSource>('teleport').then(argument('destination', entityArgument()).executes(succeed)),
        {
            description: 'Teleports entities.',
            aliases: ['tp'],
            permissionLevel: CommandPermissionLevel.GAME_DIRECTORS,
            requiresCheats: true
        }
    );

    registry.register(
        literal<TestSource>('scoreboard').then(
            literal<TestSource>('players').then(
                literal<TestSource>('set').then(
                    argument('target', entityArgument()).then(
                        argument('objective', softEnumArgument('ScoreboardObjectives')).then(
                            argument('score', integerArgument()).executes(succeed)
                        )
                    )
                )
            )
        ),
        { description: 'Tracks scores.', permissionLevel: CommandPermissionLevel.GAME_DIRECTORS }
    );

    registry.register(
        literal<TestSource>('schedule').then(
            argument('mode', enumArgument('ScheduleMode', ['append', 'replace'])).then(
                argument('delay', postfixIntegerArgument('t')).executes(succeed)
            )
        ),
        { description: 'Schedules a function.' }
    );

    registry.register(
        literal<TestSource>('data').then(
            literal<TestSource>('get').then(argument('path', nbtPathArgument()).executes(succeed))
        ),
        { description: 'Reads NBT.' }
    );

    return registry;
};

/** The wire widths `AvailableCommandsPacket` writes each field at. */
const fitsUint32 = (value: number) => Number.isInteger(value) && value >= 0 && value <= 0xff_ff_ff_ff;
const fitsUint16 = (value: number) => Number.isInteger(value) && value >= 0 && value <= 0xff_ff;
const fitsUint8 = (value: number) => Number.isInteger(value) && value >= 0 && value <= 0xff;
const fitsInt32 = (value: number) => Number.isInteger(value) && value >= -0x80_00_00_00 && value <= 0x7f_ff_ff_ff;

describe('building the AvailableCommandsPacket payload', () => {
    it('writes one command per registered name, with aliases folded in', () => {
        const { payload } = buildAvailableCommands(buildRegistry());

        // The root sorts its children, so the packet lists them alphabetically.
        expect(payload.commands.map((command) => command.name)).toEqual(['data', 'schedule', 'scoreboard', 'teleport']);
        const teleport = payload.commands.find((command) => command.name === 'teleport')!;
        expect(teleport.aliasEnum).toBeGreaterThanOrEqual(0);
        expect(payload.enums[teleport.aliasEnum]?.valueIndexes.map((index) => payload.enumValues[index])).toEqual([
            'teleport',
            'tp'
        ]);
    });

    it('gives a command with no aliases the int32 -1 the packet uses for "none"', () => {
        const { payload } = buildAvailableCommands(buildRegistry());

        expect(payload.commands.find((command) => command.name === 'data')?.aliasEnum).toBe(-1);
    });

    it('writes an enum value once even when two enums share it', () => {
        const registry = new CommandRegistry<TestSource>();
        registry.register(
            literal<TestSource>('one').then(argument('mode', enumArgument('First', ['on', 'off'])).executes(succeed))
        );
        registry.register(
            literal<TestSource>('two').then(argument('mode', enumArgument('Second', ['off', 'auto'])).executes(succeed))
        );

        const { payload } = buildAvailableCommands(registry);

        expect(payload.enumValues).toEqual(['on', 'off', 'auto']);
        expect(payload.enums).toEqual([
            { name: 'First', valueIndexes: [0, 1] },
            { name: 'Second', valueIndexes: [1, 2] }
        ]);
    });

    it('numbers hard and soft enums in separate tables', () => {
        const { payload } = buildAvailableCommands(buildRegistry());
        const objective = payload.commands
            .find((command) => command.name === 'scoreboard')
            ?.overloads[0]?.parameters.find((parameter) => parameter.name === 'objective');

        expect(payload.softEnums).toEqual([{ name: 'ScoreboardObjectives', values: [] }]);
        expect(objective?.parseSymbol).toBe(ParameterTypeFlag.SoftEnum | ParameterTypeFlag.Valid | 0);
        // Index 0 in the soft enum table, while hard enum 0 is something else.
        expect(payload.enums[0]?.name).not.toBe('ScoreboardObjectives');
    });

    it('fills a soft enum from the caller rather than inventing values', () => {
        const { payload } = buildAvailableCommands(buildRegistry(), {
            softEnumValues: { ScoreboardObjectives: ['deaths', 'kills'] }
        });

        expect(payload.softEnums).toEqual([{ name: 'ScoreboardObjectives', values: ['deaths', 'kills'] }]);
    });

    it('writes a postfixed parameter without the Valid bit, as PocketMine documents', () => {
        const { payload } = buildAvailableCommands(buildRegistry());
        const delay = payload.commands
            .find((command) => command.name === 'schedule')
            ?.overloads[0]?.parameters.find((parameter) => parameter.name === 'delay');

        expect(payload.postfixes).toEqual(['t']);
        expect(delay?.parseSymbol).toBe(ParameterTypeFlag.Postfix | 0);
        expect((delay?.parseSymbol ?? 0) & ParameterTypeFlag.Valid).toBe(0);
    });

    it('sends an argument Bedrock cannot express as a string and reports it', () => {
        const { payload, notes } = buildAvailableCommands(buildRegistry());
        const path = payload.commands
            .find((command) => command.name === 'data')
            ?.overloads[0]?.parameters.find((parameter) => parameter.name === 'path');

        // `ID` is 56, the string type, with the Valid bit set.
        expect(path?.parseSymbol).toBe(ParameterTypeFlag.Valid | 56);
        expect(notes.map((note) => note.reason)).toContain('no-bedrock-type');
    });
});

describe('the chained subcommand encoding', () => {
    const buildExecute = () => {
        const registry = new CommandRegistry<TestSource>();
        const execute = registry.register(literal<TestSource>('execute'), {
            description: 'Runs a command as another entity.',
            permissionLevel: CommandPermissionLevel.GAME_DIRECTORS,
            requiresCheats: true
        });
        execute.addChild(
            literal<TestSource>('as')
                .then(argument('origin', entityArgument()).fork(execute, { apply: () => [] }))
                .build()
        );
        execute.addChild(
            literal<TestSource>('at')
                .then(argument('origin', entityArgument()).fork(execute, { apply: () => [] }))
                .build()
        );
        execute.addChild(literal<TestSource>('run').redirect(registry.getRoot()).build());
        return registry;
    };

    it('fills the chained subcommand tables and points the command at them', () => {
        const { payload } = buildAvailableCommands(buildExecute());
        const execute = payload.commands.find((command) => command.name === 'execute')!;

        expect(payload.chainedSubcommandValues).toEqual(['as', 'at', 'run']);
        expect(payload.chainedSubcommands).toEqual([
            {
                name: 'EXECUTECHAINEDOPTION_0',
                values: [
                    { first: 0, second: 0 },
                    { first: 1, second: 1 },
                    { first: 2, second: 2 }
                ]
            }
        ]);
        expect(execute.chainedSubcommandIndexes).toEqual([0]);
    });

    it('marks the chaining overload and sets EnumAsChainedCommand on its tail', () => {
        const { payload } = buildAvailableCommands(buildExecute());
        const execute = payload.commands.find((command) => command.name === 'execute')!;
        const [chaining, run] = execute.overloads;

        expect(chaining?.isChaining).toBe(true);
        expect(chaining?.parameters.at(-1)).toEqual({
            name: 'chainedCommand',
            parseSymbol: ParameterTypeFlag.Enum | ParameterTypeFlag.Valid | 0,
            optional: false,
            options: ParameterOption.EnumAsChainedCommand
        });
        expect(run?.isChaining).toBe(false);
        // Mojang spells `/execute run <command: CODEBUILDERARGS>`, type id 92.
        expect(run?.parameters.at(-1)?.parseSymbol).toBe(ParameterTypeFlag.Valid | 92);
    });
});

describe('the payload against the packet field widths', () => {
    const assertWidths = (payload: AvailableCommandsPayload) => {
        for (const value of [...payload.enumValues, ...payload.chainedSubcommandValues, ...payload.postfixes]) {
            expect(typeof value).toBe('string');
        }

        for (const entry of payload.enums) {
            expect(typeof entry.name).toBe('string');
            for (const index of entry.valueIndexes) {
                expect(fitsUint32(index)).toBe(true);
                expect(payload.enumValues[index]).toBeTypeOf('string');
            }
        }

        for (const table of payload.chainedSubcommands) {
            for (const pair of table.values) {
                expect(fitsUint32(pair.first)).toBe(true);
                expect(fitsUint32(pair.second)).toBe(true);
            }
        }

        for (const command of payload.commands) {
            expect(fitsUint16(command.flags)).toBe(true);
            expect(fitsUint8(command.permissionLevel)).toBe(true);
            expect(command.permissionLevel).toBeLessThanOrEqual(CommandPermissionLevel.INTERNAL);
            expect(fitsInt32(command.aliasEnum)).toBe(true);
            expect(command.aliasEnum === -1 || payload.enums[command.aliasEnum] !== undefined).toBe(true);
            for (const index of command.chainedSubcommandIndexes) {
                expect(fitsUint32(index)).toBe(true);
                expect(payload.chainedSubcommands[index]).toBeDefined();
            }
            for (const overload of command.overloads) {
                expect(typeof overload.isChaining).toBe('boolean');
                for (const parameter of overload.parameters) {
                    expect(typeof parameter.name).toBe('string');
                    expect(fitsUint32(parameter.parseSymbol)).toBe(true);
                    expect(typeof parameter.optional).toBe('boolean');
                    expect(fitsUint8(parameter.options)).toBe(true);
                }
            }
        }

        for (const entry of payload.softEnums) {
            expect(typeof entry.name).toBe('string');
            for (const value of entry.values) expect(typeof value).toBe('string');
        }

        for (const constraint of payload.constraints) {
            expect(fitsUint32(constraint.enumValueSymbol)).toBe(true);
            expect(fitsUint32(constraint.enumSymbol)).toBe(true);
            for (const index of constraint.constraintIndexes) expect(fitsUint8(index)).toBe(true);
        }
    };

    it('writes every field inside the width the packet encodes it at', () => {
        assertWidths(buildAvailableCommands(buildRegistry()).payload);
    });

    it('round trips every parse symbol back to the table it points at', () => {
        const { payload } = buildAvailableCommands(buildRegistry(), {
            softEnumValues: { ScoreboardObjectives: ['kills'] }
        });

        for (const command of payload.commands) {
            for (const overload of command.overloads) {
                for (const parameter of overload.parameters) {
                    const symbol = parameter.parseSymbol;
                    if ((symbol & ParameterTypeFlag.SoftEnum) !== 0) {
                        expect(payload.softEnums[symbol & 0xff_ff]).toBeDefined();
                    } else if ((symbol & ParameterTypeFlag.Postfix) !== 0) {
                        expect(payload.postfixes[symbol & 0xff_ff]).toBeDefined();
                        expect(symbol & ParameterTypeFlag.Valid).toBe(0);
                    } else if ((symbol & ParameterTypeFlag.Enum) !== 0) {
                        const index = symbol & 0xff_ff;
                        expect(
                            payload.enums[index] !== undefined || payload.chainedSubcommands[index] !== undefined
                        ).toBe(true);
                    } else {
                        // A basic type always carries Valid and a non-zero id.
                        expect(symbol & ParameterTypeFlag.Valid).toBe(ParameterTypeFlag.Valid);
                        expect(symbol & 0xff_ff).toBeGreaterThan(0);
                    }
                }
            }
        }
    });

    it('leaves the constraint list empty, which is what this server has to say', () => {
        expect(buildAvailableCommands(buildRegistry()).payload.constraints).toEqual([]);
    });
});
