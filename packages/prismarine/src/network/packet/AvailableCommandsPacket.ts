import { NetworkUtil } from '../../network/NetworkUtil';
import Identifiers from '../Identifiers';
import type CommandData from '../type/CommandData';
import type { CommandEnum } from '../type/CommandEnum';
import type CommandEnumConstraint from '../type/CommandEnumConstraint';
import { CommandParameterTypeFlag } from '../type/CommandParameter';
import DataPacket from './DataPacket';

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
const commandPermissionToString = (level: number): string =>
    ['any', 'gamedirectors', 'admin', 'host', 'owner', 'internal'][level] ?? 'unknown';

/**
 * Tells the client which commands exist, how each one is spelled, and what it takes.
 *
 * Wire order at protocol 2193, each list a varuint count then its items:
 * - `Enum Values`: strings, one shared table every hard enum indexes into.
 * - `Chained Subcommand Values`: strings. This server has none.
 * - `Post Fixes`: strings, the suffixes a `Postfix` parameter points at.
 * - `Enum Data`: `Name` (string) then `Values`, a list of `uint32` indices into `Enum Values`.
 *   Fixed four bytes each; the width no longer depends on how many values there are.
 * - `Chained Subcommand Data`: none.
 * - `Commands`: `Name`, `Description`, `Flags` (uint16), `Permission Level` (string, see
 *   {@link commandPermissionToString}), `Alias Enum` (int32 index into `Enum Data`, -1 when
 *   the command has no aliases), `CommandData Chained Subcommand Indexes` (uint32 list, none),
 *   then `Overloads`: `isChaining` (bool) and `Parameter Data`: `Name`, `Parse Symbol`
 *   (uint32), `Is Optional?` (bool), `Options` (uint8).
 * - `Soft Enums`: `Enum Name` then `Enum Options`, strings.
 * - `Constraints`: `Enum Value Symbol` (uint32), `Enum Symbol` (uint32), `Constraint Indices`
 *   (uint8 list).
 *
 * A `Parse Symbol` is a {@link CommandParameterType} word for a plain parameter. An enum
 * parameter gets `Enum` or `SoftEnum` ORed with `Valid` and the enum's index in its own table
 * (hard and soft enums are numbered separately); a postfixed one gets `Postfix` and the index
 * into `Post Fixes`. The flag bits and type ids live in `CommandParameter.ts`.
 *
 * **Bound To:** Client
 */
export default class AvailableCommandsPacket extends DataPacket {
    public static NetID = Identifiers.AvailableCommandsPacket;

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

        this.commandData.forEach((commandData) => {
            if (commandData.aliases) {
                appendEnum(commandData.aliases);
            }

            commandData.overloads.forEach((overload) => {
                overload.forEach((parameter) => {
                    if (parameter.enum) {
                        appendEnum(parameter.enum);
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

        this.writeUnsignedVarInt(0); // Chained Subcommand Values.

        this.writeUnsignedVarInt(postfixIndexes.size);
        postfixIndexes.forEach((_index: number, postfix: string) => {
            NetworkUtil.writeString(this, postfix);
        });

        this.writeUnsignedVarInt(enums.length);
        enums.forEach((_enum: CommandEnum) => {
            this.writeEnum(_enum, enumValueIndexes);
        });

        this.writeUnsignedVarInt(0); // Chained Subcommand Data.

        this.writeUnsignedVarInt(this.commandData.length);
        this.commandData.forEach((data: CommandData) => {
            this.writeCommandData(data, enumIndexes, softEnumIndexes, postfixIndexes);
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

    private writeCommandData(
        data: CommandData,
        enumIndexes: Map<string, number>,
        softEnumIndexes: Map<string, number>,
        postfixIndexes: Map<string, number>
    ): void {
        NetworkUtil.writeString(this, data.commandName);
        NetworkUtil.writeString(this, data.commandDescription);
        this.writeUnsignedShortLE(data.flags);
        NetworkUtil.writeString(this, commandPermissionToString(data.permission));

        // `Alias Enum` is a signed index; -1 says the command has none.
        this.writeIntLE(data.aliases === null ? -1 : (enumIndexes.get(data.aliases.name) ?? -1));

        this.writeUnsignedVarInt(0); // CommandData Chained Subcommand Indexes.

        this.writeUnsignedVarInt(data.overloads.length);
        data.overloads.forEach((overload) => {
            this.writeBoolean(false); // isChaining.
            this.writeUnsignedVarInt(overload.length);

            overload.forEach((parameter) => {
                NetworkUtil.writeString(this, parameter.paramName);

                let type: number = parameter.paramType;
                if (parameter.enum !== null) {
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
                this.writeByte(parameter.flags);
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
