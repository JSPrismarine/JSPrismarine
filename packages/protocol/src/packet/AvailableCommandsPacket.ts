import { availableCommandsPacket } from '../wire/definitions/availableCommands';
import { formatWireValue } from '../wire/formatWireValue';
import { CommandChainedSubcommand } from '../wire/structures/CommandChainedSubcommand';
import CommandData from '../wire/structures/CommandData';
import { CommandEnum } from '../wire/structures/CommandEnum';
import CommandEnumConstraint from '../wire/structures/CommandEnumConstraint';
import CommandParameter, {
    CommandParameterFlags,
    CommandParameterType,
    CommandParameterTypeFlag
} from '../wire/structures/CommandParameter';
import { layoutAt } from '../wire/WireLayout';
import FieldNetworkPacket from '../FieldNetworkPacket';

import type { AvailableCommandsPayload } from '../wire/definitions/availableCommands';

/**
 * The name protocol 2193 writes a command's `Permission Level` under.
 *
 * The docs type `CommandPermissionLevel` is a `uint8` where it carries `Enum-as-Value`
 * (`AddPlayerPacket`, `UpdateAbilitiesPacket`) and a string here, where it does not. The names
 * are lower case on the wire; the docs page prints the member names in CamelCase, but a real
 * server's payload (`bedrock-data/src/jsp/v2193/wire/0x4c.bin` and its `v2225` twin) carries
 * `gamedirectors`, and `AvailableCommandsPacket.test.ts` reads those fixtures. A level outside
 * the table is `unknown`, which the client's own table also falls back to.
 * @param {number} level - The permission level, 0 (`Any`) to 5 (`Internal`).
 * @returns {string} The name the client reads.
 */
const COMMAND_PERMISSION_NAMES = ['any', 'gamedirectors', 'admin', 'host', 'owner', 'internal'];

const commandPermissionToString = (level: number): string => COMMAND_PERMISSION_NAMES[level] ?? 'unknown';

/** The level a wire permission name stands for; an unknown name reads as level 0, `any`. */
const commandPermissionFromString = (name: string): number => Math.max(0, COMMAND_PERMISSION_NAMES.indexOf(name));

/**
 * Whether a chain can continue into an overload, the packet's `isChaining`.
 *
 * It can when the overload starts with a keyword of the command's chained subcommand tables, or
 * ends in a chained subcommand. A real server marks all of `/execute`'s overloads, `run` too
 * (`bedrock-data/src/jsp/v2193/wire/0x4c.bin`). The flag is read off the parameters rather than
 * stored a second time where the two could disagree.
 * @param {CommandData} data - The command the overload belongs to.
 * @param {CommandParameter[]} overload - The overload's parameters.
 * @returns {boolean} The `isChaining` flag.
 */
const isChainingOverload = (data: CommandData, overload: CommandParameter[]): boolean => {
    if (overload.some((parameter) => parameter.chainedSubcommand !== null)) return true;
    const leading = overload[0]?.enum;
    if (leading?.soft !== false) return false;
    const tables = [
        ...data.chainedSubcommands,
        ...data.overloads.flat().flatMap((parameter) => parameter.chainedSubcommand ?? [])
    ];
    return leading.values.some((value) => tables.some((table) => table.values.includes(value)));
};

/** The low bits of a parameter's Parse Symbol: the index an enum, soft enum or postfix word carries. */
const PARSE_SYMBOL_INDEX_MASK = 0xffff;

/**
 * Tells the client which commands exist, how each one is spelled, and what it takes.
 *
 * Wire order at protocol 2193, each list a varuint count then its items:
 * - `Enum Values`: strings, one shared table every hard enum indexes into.
 * - `Chained Subcommand Values`: strings, one shared table every chained subcommand table
 *   indexes into.
 * - `Post Fixes`: strings, the suffixes a `Postfix` parameter points at.
 * - `Enum Data`: `Name` (string) then `Values`, a list of `uint32` indices into `Enum Values`.
 *   Fixed four bytes each; the width no longer depends on how many values there are.
 * - `Chained Subcommand Data`: `Name` (string) then a list of `{first, second}` varuint pairs:
 *   the keyword's index in `Chained Subcommand Values` and the index in `Enum Data` of the
 *   enum that holds that keyword.
 * - `Commands`: `Name`, `Description`, `Flags` (uint16), `Permission Level` (string, see
 *   {@link commandPermissionToString}), `Alias Enum` (int32 index into `Enum Data`, -1 when
 *   the command has no aliases), `CommandData Chained Subcommand Indexes` (uint32 list),
 *   then `Overloads`: `isChaining` (bool) and `Parameter Data`: `Name`, `Parse Symbol`
 *   (uint32), `Is Optional?` (bool), `Options` (uint8).
 * - `Soft Enums`: `Enum Name` then `Enum Options`, strings.
 * - `Constraints`: `Enum Value Symbol` (uint32), `Enum Symbol` (uint32), `Constraint Indices`
 *   (uint8 list).
 *
 * A `Parse Symbol` is a {@link CommandParameterType} word for a plain parameter. An enum
 * parameter gets `Enum` or `SoftEnum` ORed with `Valid` and the enum's index in its own table
 * (hard enums, soft enums and chained subcommands are numbered separately); a chained
 * subcommand gets `Chained` ORed with `Valid` and its table's index; a postfixed one
 * gets `Postfix` and the index into `Post Fixes`. The flag bits and type ids live in
 * `CommandParameter.ts`.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/available-commands-packet/
 */
export default class AvailableCommandsPacket extends FieldNetworkPacket {
    public commandData: CommandData[] = [];
    public hardcodedEnums: CommandEnum[] = [];
    public softEnums: CommandEnum[] = [];
    public enumConstraints: CommandEnumConstraint[] = [];

    /** Writes the shared enum tables and command records in the protocol's required order. */
    public encodePayload(): void {
        const enumValueIndexes: Map<string, number> = new Map();
        const postfixIndexes: Map<string, number> = new Map();
        const enums: CommandEnum[] = [];
        const enumIndexes: Map<string, number> = new Map();
        const softEnums: CommandEnum[] = [];
        const softEnumIndexes: Map<string, number> = new Map();
        const chainedValueIndexes: Map<string, number> = new Map();
        const chainedSubcommands: CommandChainedSubcommand[] = [];
        const chainedSubcommandIndexes: Map<string, number> = new Map();

        const appendChainedSubcommand = (table: CommandChainedSubcommand) => {
            table.values.forEach((value) => {
                if (!chainedValueIndexes.has(value)) {
                    chainedValueIndexes.set(value, chainedValueIndexes.size);
                }
            });
            if (!chainedSubcommandIndexes.has(table.name)) {
                const index = chainedSubcommandIndexes.set(table.name, chainedSubcommandIndexes.size).get(table.name)!;
                chainedSubcommands[index] = table;
            }
        };

        const appendEnum = (_enum: CommandEnum) => {
            const { name, soft, values } = _enum;

            if (soft) {
                if (!softEnumIndexes.has(name)) {
                    const index = softEnumIndexes.set(name, softEnumIndexes.size).get(name)!;
                    softEnums[index] = _enum;
                }
                return;
            }

            values.forEach((value) => {
                if (!enumValueIndexes.has(value)) {
                    enumValueIndexes.set(value, enumValueIndexes.size);
                }
            });
            if (!enumIndexes.has(name)) {
                const index = enumIndexes.set(name, enumIndexes.size).get(name)!;
                enums[index] = _enum;
            }
        };

        this.hardcodedEnums.forEach((e) => appendEnum(e));
        this.softEnums.forEach((e) => appendEnum(e));

        // Every command's own tables first, so an index a command declares and an index a
        // parameter points at are the same number for the same table.
        this.commandData.forEach((commandData) => {
            commandData.chainedSubcommands.forEach((table) => appendChainedSubcommand(table));
        });

        this.commandData.forEach((commandData) => {
            if (commandData.aliases) {
                appendEnum(commandData.aliases);
            }

            commandData.overloads.forEach((overload) => {
                overload.forEach((parameter) => {
                    if (parameter.enum) {
                        appendEnum(parameter.enum);
                    }

                    if (parameter.chainedSubcommand) {
                        appendChainedSubcommand(parameter.chainedSubcommand);
                    }

                    if (parameter.postfix) {
                        if (!postfixIndexes.has(parameter.postfix)) {
                            postfixIndexes.set(parameter.postfix, postfixIndexes.size);
                        }
                    }
                });
            });
        });

        // A constraint names an enum and one of its values; both get an index here so the
        // symbols written below always point at something in the packet.
        this.enumConstraints.forEach((constraint) => appendEnum(constraint.getEnum()));

        // Each chained keyword's enum: the first hard enum, among the parameters that lead an
        // overload ending in a chained subcommand, that lists the keyword. `/execute` has one
        // enum per keyword (`Option_As`, `Option_If_Unless`) as the overload's first parameter.
        const keywordEnums: Map<string, number> = new Map();
        this.commandData.forEach((commandData) => {
            commandData.overloads.forEach((overload) => {
                if (!overload.some((parameter) => parameter.chainedSubcommand !== null)) return;
                overload.forEach((parameter) => {
                    const index = parameter.enum?.soft === false ? enumIndexes.get(parameter.enum.name) : undefined;
                    if (index === undefined) return;
                    parameter.enum?.values.forEach((value) => {
                        if (!keywordEnums.has(value)) keywordEnums.set(value, index);
                    });
                });
            });
        });

        // The collected lists, not `this.softEnums`: a soft enum that only a parameter refers to
        // was given an index above, and the client needs an entry at that index.
        const payload: AvailableCommandsPayload = {
            enumValues: [...enumValueIndexes.keys()],
            chainedSubcommandValues: [...chainedValueIndexes.keys()],
            postfixes: [...postfixIndexes.keys()],
            enums: enums.map(({ name, values }) => ({
                name,
                // The count written is the number of indices that follow, so a value missing from
                // the table cannot leave the client reading the next field as an index.
                values: values.flatMap((value) => {
                    const index = enumValueIndexes.get(value);
                    return index === undefined ? [] : [index];
                })
            })),
            chainedSubcommands: chainedSubcommands.map(({ name, values }) => ({
                name,
                values: values.flatMap((value) => {
                    const index = chainedValueIndexes.get(value);
                    // `second` is the `Enum Data` index of the keyword's own enum. A keyword no
                    // overload's enum names has none, and repeats its own index.
                    return index === undefined ? [] : [{ first: index, second: keywordEnums.get(value) ?? index }];
                })
            })),
            commands: this.commandData.map((data) => ({
                name: data.commandName,
                description: data.commandDescription,
                flags: data.flags,
                permissionLevel: commandPermissionToString(data.permission),
                // `Alias Enum` is a signed index; -1 says the command has none.
                aliasEnum: data.aliases === null ? -1 : (enumIndexes.get(data.aliases.name) ?? -1),
                chainedSubcommandIndexes: data.chainedSubcommands.flatMap((table) => {
                    const index = chainedSubcommandIndexes.get(table.name);
                    return index === undefined ? [] : [index];
                }),
                overloads: data.overloads.map((overload) => ({
                    isChaining: isChainingOverload(data, overload),
                    parameters: overload.map((parameter) => {
                        let type: number = parameter.paramType;
                        let flags: number = parameter.flags;
                        if (parameter.chainedSubcommand !== null) {
                            // The word a real server writes for a chained subcommand: `Chained` and
                            // `Valid` over the table's index, with `EnumAsChainedCommand` in the options.
                            type =
                                CommandParameterTypeFlag.Chained |
                                CommandParameterTypeFlag.Valid |
                                (chainedSubcommandIndexes.get(parameter.chainedSubcommand.name) ?? 0);
                            flags |= CommandParameterFlags.ENUM_AS_CHAINED_COMMAND;
                        } else if (parameter.enum !== null) {
                            type = parameter.enum.soft
                                ? CommandParameterTypeFlag.SoftEnum |
                                  CommandParameterTypeFlag.Valid |
                                  (softEnumIndexes.get(parameter.enum.name) ?? 0)
                                : CommandParameterTypeFlag.Enum |
                                  CommandParameterTypeFlag.Valid |
                                  (enumIndexes.get(parameter.enum.name) ?? 0);
                        } else if (parameter.postfix !== null) {
                            type = CommandParameterTypeFlag.Postfix | (postfixIndexes.get(parameter.postfix) ?? 0);
                        }

                        return {
                            name: parameter.paramName,
                            parseSymbol: type >>> 0,
                            isOptional: parameter.isOptional,
                            options: flags
                        };
                    })
                }))
            })),
            softEnums: softEnums.map(({ name, values }) => ({ name, options: values })),
            constraints: this.enumConstraints.map((constraint) => ({
                enumValueSymbol: enumValueIndexes.get(constraint.getAffectedValue()) ?? 0,
                enumSymbol: enumIndexes.get(constraint.getEnum().name) ?? 0,
                constraintIndices: constraint.getConstraints()
            }))
        };

        layoutAt(availableCommandsPacket, this.codecProtocol).encode(this, payload);
    }

    /**
     * Reads the eight lists back, the mirror of {@link encodePayload}.
     *
     * The shared index tables dissolve into the objects they described: every hard enum lands
     * in {@link hardcodedEnums}, every soft enum in {@link softEnums}, and a command's alias
     * enum, chained subcommand tables and parameter references point at those objects. The
     * `Commands` list arrives before the `Soft Enums` table it indexes into, so parameters
     * naming a soft enum are resolved once that table has been read. An overload's
     * `isChaining` flag is read past: the encoder derives it from the parameters.
     * @throws {Error} when a parameter or constraint names an index outside its table.
     */
    public decodePayload(): void {
        const read = layoutAt(availableCommandsPacket, this.codecProtocol).decode(this);
        const { enumValues, chainedSubcommandValues: chainedValues, postfixes } = read;

        const enums: CommandEnum[] = read.enums.map(({ name, values: indices }) => {
            const values = indices.map((index) => {
                const value = enumValues[index];
                if (value === undefined)
                    throw new Error(`Enum ${formatWireValue(name)} points at missing enum value ${index}`);
                return value;
            });
            return Object.assign(new CommandEnum(), { name, values, soft: false });
        });

        const chainedSubcommands: CommandChainedSubcommand[] = read.chainedSubcommands.map(
            ({ name, values: pairs }) => {
                // `second`, the keyword's enum, is read past: the encoder rebuilds it from the overloads.
                const values = pairs.map(({ first }) => {
                    const value = chainedValues[first];
                    if (value === undefined)
                        throw new Error(`Subcommand ${formatWireValue(name)} points at missing value ${first}`);
                    return value;
                });
                return Object.assign(new CommandChainedSubcommand(), { name, values });
            }
        );

        // Parameters naming a soft enum, to resolve once the Soft Enums table is read below.
        const pendingSoftEnums: { parameter: CommandParameter; index: number }[] = [];

        this.commandData = read.commands.map((command) => {
            const data = new CommandData();
            data.commandName = command.name;
            data.commandDescription = command.description;
            data.flags = command.flags;
            data.permission = commandPermissionFromString(command.permissionLevel);
            data.aliases = command.aliasEnum === -1 ? null : (enums[command.aliasEnum] ?? null);

            data.chainedSubcommands = command.chainedSubcommandIndexes.map((index) => {
                const table = chainedSubcommands[index];
                if (table === undefined) {
                    throw new Error(
                        `Command ${formatWireValue(data.commandName)} points at missing subcommand table ${index}`
                    );
                }
                return table;
            });

            // `isChaining` is read past: the encoder derives it from the parameters.
            data.overloads = command.overloads.map(({ parameters }) =>
                parameters.map(({ name: paramName, parseSymbol: type, isOptional, options }) => {
                    const parameter = new CommandParameter({ paramName, isOptional, flags: options });
                    const index = type & PARSE_SYMBOL_INDEX_MASK;

                    if (type & CommandParameterTypeFlag.Chained) {
                        const table = chainedSubcommands[index];
                        if (table === undefined) {
                            throw new Error(
                                `Parameter ${formatWireValue(paramName)} points at missing subcommand table ${index}`
                            );
                        }
                        parameter.chainedSubcommand = table;
                        // The encoder re-adds the flag from `chainedSubcommand`.
                        parameter.flags = options & ~CommandParameterFlags.ENUM_AS_CHAINED_COMMAND;
                    } else if (type & CommandParameterTypeFlag.SoftEnum) {
                        pendingSoftEnums.push({ parameter, index });
                    } else if (type & CommandParameterTypeFlag.Enum) {
                        if (options & CommandParameterFlags.ENUM_AS_CHAINED_COMMAND) {
                            const table = chainedSubcommands[index];
                            if (table === undefined) {
                                throw new Error(
                                    `Parameter ${formatWireValue(paramName)} points at missing subcommand table ${index}`
                                );
                            }
                            parameter.chainedSubcommand = table;
                            // The encoder re-adds the flag from `chainedSubcommand`.
                            parameter.flags = options & ~CommandParameterFlags.ENUM_AS_CHAINED_COMMAND;
                        } else {
                            const found = enums[index];
                            if (found === undefined) {
                                throw new Error(
                                    `Parameter ${formatWireValue(paramName)} points at missing enum ${index}`
                                );
                            }
                            parameter.enum = found;
                        }
                    } else if (type & CommandParameterTypeFlag.Postfix) {
                        const postfix = postfixes[index];
                        if (postfix === undefined) {
                            throw new Error(
                                `Parameter ${formatWireValue(paramName)} points at missing postfix ${index}`
                            );
                        }
                        parameter.postfix = postfix;
                    } else {
                        const word = Object.values(CommandParameterType).find((value) => value === type);
                        if (word === undefined) {
                            throw new Error(
                                `Parameter ${formatWireValue(paramName)} carries unknown parse symbol ${type}`
                            );
                        }
                        parameter.paramType = word;
                    }

                    return parameter;
                })
            );

            return data;
        });

        this.softEnums = read.softEnums.map(({ name, options }) =>
            Object.assign(new CommandEnum(), { name, values: options, soft: true })
        );
        for (const { parameter, index } of pendingSoftEnums) {
            const found = this.softEnums[index];
            if (found === undefined) {
                throw new Error(
                    `Parameter ${formatWireValue(parameter.paramName)} points at missing soft enum ${index}`
                );
            }
            parameter.enum = found;
        }

        // Each constrained enum's value to its first offset, built once on the enum's first
        // constraint. Searching the enum's values per constraint made a packet with many
        // values and many constraints cost their product.
        const offsets = new Map<CommandEnum, Map<string, number>>();
        const offsetOf = (constrained: CommandEnum, value: string): number => {
            let offsetsOf = offsets.get(constrained);
            if (offsetsOf === undefined) {
                offsetsOf = new Map();
                for (const [offset, member] of constrained.values.entries()) {
                    if (!offsetsOf.has(member)) offsetsOf.set(member, offset);
                }
                offsets.set(constrained, offsetsOf);
            }
            return offsetsOf.get(value) ?? -1;
        };
        this.enumConstraints = read.constraints.map(({ enumValueSymbol, enumSymbol, constraintIndices }) => {
            const constrained = enums[enumSymbol];
            const value = enumValues[enumValueSymbol];
            if (constrained === undefined || value === undefined) {
                throw new Error(`A constraint points at missing enum ${enumSymbol} or value ${enumValueSymbol}`);
            }
            return new CommandEnumConstraint(constrained, offsetOf(constrained, value), constraintIndices);
        });

        this.hardcodedEnums = enums;
    }
}
