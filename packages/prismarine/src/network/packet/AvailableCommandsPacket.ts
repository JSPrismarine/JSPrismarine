import { NetworkUtil } from '../../network/NetworkUtil';
import { CommandChainedSubcommand } from '../type/CommandChainedSubcommand';
import CommandData from '../type/CommandData';
import { CommandEnum } from '../type/CommandEnum';
import CommandEnumConstraint from '../type/CommandEnumConstraint';
import CommandParameter, {
    CommandParameterFlags,
    CommandParameterType,
    CommandParameterTypeFlag
} from '../type/CommandParameter';
import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * The name protocol 2193 writes a command's `Permission Level` under.
 *
 * The docs type `CommandPermissionLevel` is a `uint8` where it carries `Enum-as-Value`
 * (`AddPlayerPacket`, `UpdateAbilitiesPacket`) and a string here, where it does not. The names
 * are lower case on the wire; gophertunnel's `commandPermissionToString` at 2193 writes them
 * that way and the docs page prints the member names in CamelCase. A level outside the table
 * is `unknown`, which the client's own table also falls back to.
 * @param {number} level - The permission level, 0 (`Any`) to 5 (`Internal`).
 * @returns {string} The name the client reads.
 */
const COMMAND_PERMISSION_NAMES = ['any', 'gamedirectors', 'admin', 'host', 'owner', 'internal'];

const commandPermissionToString = (level: number): string => COMMAND_PERMISSION_NAMES[level] ?? 'unknown';

/** The level a wire permission name stands for; an unknown name reads as level 0, `any`. */
const commandPermissionFromString = (name: string): number => Math.max(0, COMMAND_PERMISSION_NAMES.indexOf(name));

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
 * - `Chained Subcommand Data`: `Name` (string) then a list of `{first, second}` varuint pairs.
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
 * (hard enums, soft enums and chained subcommands are numbered separately); a postfixed one
 * gets `Postfix` and the index into `Post Fixes`. The flag bits and type ids live in
 * `CommandParameter.ts`.
 *
 * **Bound To:** Client
 */
export default class AvailableCommandsPacket extends FieldNetworkPacket {
    public commandData: CommandData[] = [];
    public hardcodedEnums: CommandEnum[] = [];
    public softEnums: CommandEnum[] = [];
    public enumConstraints: CommandEnumConstraint[] = [];

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

        this.writeUnsignedVarInt(enumValueIndexes.size);
        enumValueIndexes.forEach((_index: number, enumValue: string) => {
            NetworkUtil.writeString(this, enumValue);
        });

        this.writeUnsignedVarInt(chainedValueIndexes.size);
        chainedValueIndexes.forEach((_index: number, value: string) => {
            NetworkUtil.writeString(this, value);
        });

        this.writeUnsignedVarInt(postfixIndexes.size);
        postfixIndexes.forEach((_index: number, postfix: string) => {
            NetworkUtil.writeString(this, postfix);
        });

        this.writeUnsignedVarInt(enums.length);
        enums.forEach((_enum: CommandEnum) => {
            this.writeEnum(_enum, enumValueIndexes);
        });

        this.writeUnsignedVarInt(chainedSubcommands.length);
        chainedSubcommands.forEach((table: CommandChainedSubcommand) => {
            this.writeChainedSubcommand(table, chainedValueIndexes);
        });

        this.writeUnsignedVarInt(this.commandData.length);
        this.commandData.forEach((data: CommandData) => {
            this.writeCommandData(data, enumIndexes, softEnumIndexes, postfixIndexes, chainedSubcommandIndexes);
        });

        // The collected list, not `this.softEnums`: a soft enum that only a parameter refers to
        // was given an index above, and the client needs an entry at that index.
        this.writeUnsignedVarInt(softEnums.length);
        softEnums.forEach((_enum: CommandEnum) => {
            this.writeSoftEnum(_enum);
        });

        this.writeUnsignedVarInt(this.enumConstraints.length);
        this.enumConstraints.forEach((constraint: CommandEnumConstraint) => {
            this.writeEnumConstraint(constraint, enumIndexes, enumValueIndexes);
        });
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
        const enumValues: string[] = [];
        for (let i = 0, count = this.readUnsignedVarInt(); i < count; i++) {
            enumValues.push(NetworkUtil.readString(this));
        }

        const chainedValues: string[] = [];
        for (let i = 0, count = this.readUnsignedVarInt(); i < count; i++) {
            chainedValues.push(NetworkUtil.readString(this));
        }

        const postfixes: string[] = [];
        for (let i = 0, count = this.readUnsignedVarInt(); i < count; i++) {
            postfixes.push(NetworkUtil.readString(this));
        }

        const enums: CommandEnum[] = [];
        for (let i = 0, count = this.readUnsignedVarInt(); i < count; i++) {
            const name = NetworkUtil.readString(this);
            const values: string[] = [];
            for (let j = 0, indices = this.readUnsignedVarInt(); j < indices; j++) {
                const index = this.readUnsignedIntLE();
                const value = enumValues[index];
                if (value === undefined) throw new Error(`Enum ${name} points at missing enum value ${index}`);
                values.push(value);
            }
            enums.push(Object.assign(new CommandEnum(), { name, values, soft: false }));
        }

        const chainedSubcommands: CommandChainedSubcommand[] = [];
        for (let i = 0, count = this.readUnsignedVarInt(); i < count; i++) {
            const name = NetworkUtil.readString(this);
            const values: string[] = [];
            for (let j = 0, pairs = this.readUnsignedVarInt(); j < pairs; j++) {
                const first = this.readUnsignedVarInt();
                this.readUnsignedVarInt(); // `second`, the same index again.
                const value = chainedValues[first];
                if (value === undefined) throw new Error(`Subcommand ${name} points at missing value ${first}`);
                values.push(value);
            }
            chainedSubcommands.push(Object.assign(new CommandChainedSubcommand(), { name, values }));
        }

        // Parameters naming a soft enum, to resolve once the Soft Enums table is read below.
        const pendingSoftEnums: { parameter: CommandParameter; index: number }[] = [];

        this.commandData = [];
        for (let i = 0, count = this.readUnsignedVarInt(); i < count; i++) {
            const data = new CommandData();
            data.commandName = NetworkUtil.readString(this);
            data.commandDescription = NetworkUtil.readString(this);
            data.flags = this.readUnsignedShortLE();
            data.permission = commandPermissionFromString(NetworkUtil.readString(this));

            const aliasIndex = this.readIntLE();
            data.aliases = aliasIndex === -1 ? null : (enums[aliasIndex] ?? null);

            data.chainedSubcommands = [];
            for (let j = 0, indices = this.readUnsignedVarInt(); j < indices; j++) {
                const index = this.readUnsignedIntLE();
                const table = chainedSubcommands[index];
                if (table === undefined) {
                    throw new Error(`Command ${data.commandName} points at missing subcommand table ${index}`);
                }
                data.chainedSubcommands.push(table);
            }

            data.overloads = [];
            for (let j = 0, overloads = this.readUnsignedVarInt(); j < overloads; j++) {
                this.readBoolean(); // isChaining, derived from the parameters on encode.

                const overload: CommandParameter[] = [];
                for (let k = 0, parameters = this.readUnsignedVarInt(); k < parameters; k++) {
                    const paramName = NetworkUtil.readString(this);
                    const type = this.readUnsignedIntLE();
                    const isOptional = this.readBoolean();
                    const options = this.readByte();

                    const parameter = new CommandParameter({ paramName, isOptional, flags: options });
                    const index = type & PARSE_SYMBOL_INDEX_MASK;

                    if (type & CommandParameterTypeFlag.SoftEnum) {
                        pendingSoftEnums.push({ parameter, index });
                    } else if (type & CommandParameterTypeFlag.Enum) {
                        if (options & CommandParameterFlags.ENUM_AS_CHAINED_COMMAND) {
                            const table = chainedSubcommands[index];
                            if (table === undefined) {
                                throw new Error(`Parameter ${paramName} points at missing subcommand table ${index}`);
                            }
                            parameter.chainedSubcommand = table;
                            // The encoder re-adds the flag from `chainedSubcommand`.
                            parameter.flags = options & ~CommandParameterFlags.ENUM_AS_CHAINED_COMMAND;
                        } else {
                            const found = enums[index];
                            if (found === undefined) {
                                throw new Error(`Parameter ${paramName} points at missing enum ${index}`);
                            }
                            parameter.enum = found;
                        }
                    } else if (type & CommandParameterTypeFlag.Postfix) {
                        const postfix = postfixes[index];
                        if (postfix === undefined) {
                            throw new Error(`Parameter ${paramName} points at missing postfix ${index}`);
                        }
                        parameter.postfix = postfix;
                    } else {
                        const word = Object.values(CommandParameterType).find((value) => value === type);
                        if (word === undefined) {
                            throw new Error(`Parameter ${paramName} carries unknown parse symbol ${type}`);
                        }
                        parameter.paramType = word;
                    }

                    overload.push(parameter);
                }
                data.overloads.push(overload);
            }

            this.commandData.push(data);
        }

        this.softEnums = [];
        for (let i = 0, count = this.readUnsignedVarInt(); i < count; i++) {
            const name = NetworkUtil.readString(this);
            const values: string[] = [];
            for (let j = 0, options = this.readUnsignedVarInt(); j < options; j++) {
                values.push(NetworkUtil.readString(this));
            }
            this.softEnums.push(Object.assign(new CommandEnum(), { name, values, soft: true }));
        }
        for (const { parameter, index } of pendingSoftEnums) {
            const found = this.softEnums[index];
            if (found === undefined) {
                throw new Error(`Parameter ${parameter.paramName} points at missing soft enum ${index}`);
            }
            parameter.enum = found;
        }

        this.enumConstraints = [];
        for (let i = 0, count = this.readUnsignedVarInt(); i < count; i++) {
            const valueIndex = this.readUnsignedIntLE(); // Enum Value Symbol.
            const enumIndex = this.readUnsignedIntLE(); // Enum Symbol.

            const constraints: number[] = [];
            for (let j = 0, indices = this.readUnsignedVarInt(); j < indices; j++) {
                constraints.push(this.readByte());
            }

            const constrained = enums[enumIndex];
            const value = enumValues[valueIndex];
            if (constrained === undefined || value === undefined) {
                throw new Error(`A constraint points at missing enum ${enumIndex} or value ${valueIndex}`);
            }
            this.enumConstraints.push(
                new CommandEnumConstraint(constrained, constrained.values.indexOf(value), constraints)
            );
        }

        this.hardcodedEnums = enums;
    }

    /**
     * One `Enum Data` entry: the name, then each value's index in `Enum Values` as a uint32.
     *
     * Four bytes per index regardless of the table's size. Before 1.21.130 the width followed
     * the number of enum values (one byte under 256, two under 65536); the docs for 2193 list
     * the field as `array<uint32>` and gophertunnel has read it as `Uint32` since that release.
     * The count written is the number of indices that follow, so a value missing from the
     * table cannot leave the client reading the next field as an index.
     */
    private writeEnum({ name, values }: CommandEnum, enumValueMap: Map<string, number>): void {
        const indices = values.flatMap((value) => {
            const index = enumValueMap.get(value);
            return index === undefined ? [] : [index];
        });

        NetworkUtil.writeString(this, name);
        this.writeUnsignedVarInt(indices.length);
        indices.forEach((index) => this.writeUnsignedIntLE(index));
    }

    /**
     * One `Chained Subcommand Data` entry: the name, then a `{first, second}` varuint pair per
     * keyword.
     *
     * Mojang's schema names the two members and defines neither. The only datum the table has
     * per entry is the keyword, so its index in `Chained Subcommand Values` goes in both, which
     * is what `@jsprismarine/commands` builds and what gophertunnel reads back.
     */
    private writeChainedSubcommand(
        { name, values }: CommandChainedSubcommand,
        chainedValueIndexes: Map<string, number>
    ): void {
        const indices = values.flatMap((value) => {
            const index = chainedValueIndexes.get(value);
            return index === undefined ? [] : [index];
        });

        NetworkUtil.writeString(this, name);
        this.writeUnsignedVarInt(indices.length);
        indices.forEach((index) => {
            this.writeUnsignedVarInt(index);
            this.writeUnsignedVarInt(index);
        });
    }

    private writeCommandData(
        data: CommandData,
        enumIndexes: Map<string, number>,
        softEnumIndexes: Map<string, number>,
        postfixIndexes: Map<string, number>,
        chainedSubcommandIndexes: Map<string, number>
    ): void {
        NetworkUtil.writeString(this, data.commandName);
        NetworkUtil.writeString(this, data.commandDescription);
        this.writeUnsignedShortLE(data.flags);
        NetworkUtil.writeString(this, commandPermissionToString(data.permission));

        // `Alias Enum` is a signed index; -1 says the command has none.
        this.writeIntLE(data.aliases === null ? -1 : (enumIndexes.get(data.aliases.name) ?? -1));

        const chainedIndices = data.chainedSubcommands.flatMap((table) => {
            const index = chainedSubcommandIndexes.get(table.name);
            return index === undefined ? [] : [index];
        });
        this.writeUnsignedVarInt(chainedIndices.length);
        chainedIndices.forEach((index) => this.writeUnsignedIntLE(index));

        this.writeUnsignedVarInt(data.overloads.length);
        data.overloads.forEach((overload) => {
            // Mojang's own data marks an overload as chaining exactly when it ends in a
            // chained subcommand, so the flag is read off the parameters rather than stored
            // a second time where the two could disagree.
            this.writeBoolean(overload.some((parameter) => parameter.chainedSubcommand !== null));
            this.writeUnsignedVarInt(overload.length);

            overload.forEach((parameter) => {
                NetworkUtil.writeString(this, parameter.paramName);

                let type: number = parameter.paramType;
                let flags: number = parameter.flags;
                if (parameter.chainedSubcommand !== null) {
                    // A chained subcommand carries the enum flags over its own index space.
                    // `EnumAsChainedCommand` is what tells the client which space it is in.
                    type =
                        CommandParameterTypeFlag.Enum |
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

                this.writeUnsignedIntLE(type >>> 0);
                this.writeBoolean(parameter.isOptional);
                this.writeByte(flags);
            });
        });
    }

    private writeSoftEnum(_enum: CommandEnum): void {
        NetworkUtil.writeString(this, _enum.name);
        this.writeUnsignedVarInt(_enum.values.length);
        _enum.values.forEach((value: string) => {
            NetworkUtil.writeString(this, value);
        });
    }

    private writeEnumConstraint(
        constraint: CommandEnumConstraint,
        enumIndexes: Map<string, number>,
        enumValueIndexes: Map<string, number>
    ): void {
        this.writeUnsignedIntLE(enumValueIndexes.get(constraint.getAffectedValue()) ?? 0);
        this.writeUnsignedIntLE(enumIndexes.get(constraint.getEnum().name) ?? 0);
        this.writeUnsignedVarInt(constraint.getConstraints().length);
        constraint.getConstraints().forEach((v) => {
            this.writeByte(v);
        });
    }
}
