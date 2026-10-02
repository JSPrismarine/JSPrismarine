import { NetworkUtil } from '../../network/NetworkUtil';
import Identifiers from '../Identifiers';
import type CommandData from '../type/CommandData';
import type { CommandEnum } from '../type/CommandEnum';
import type CommandEnumConstraint from '../type/CommandEnumConstraint';
import DataPacket from './DataPacket';

/**
 * The name 1.26.50 carries a command's permission level under.
 *
 * The level itself is still a small integer everywhere else; only the wire spells it out.
 * Anything unrecognised is `unknown`, which is what the client's own table falls back to.
 * @param {number} level - The permission level.
 * @returns {string} The name the client reads.
 */
const commandPermissionToString = (level: number): string =>
    ['any', 'gamedirectors', 'admin', 'host', 'owner', 'internal'][level] ?? 'unknown';

/**
 * AvailableCommandsPacket is sent by the server to the client to provide information about available commands.
 * @TODO: Argument types are not implemented.
 */
export default class AvailableCommandsPacket extends DataPacket {
    public static NetID = Identifiers.AvailableCommandsPacket;

    public ARG_FLAG_VALID = 0x100000;
    public ARG_FLAG_INT = 1;
    public ARG_FLAG_FLOAT = 3;
    public ARG_TYPE_WILDCARD_INT = 5;
    public ARG_TYPE_STRING = 56;
    public ARG_TYPE_INT_POSITION = 64;
    public ARG_TYPE_POSITION = 65;
    public ARG_FLAG_ENUM = 0x200000;
    public ARG_FLAG_POSTFIX = 0x1000000;
    public ARG_FLAG_SOFT_ENUM = 0x4000000;

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

        this.writeUnsignedVarInt(enumValueIndexes.size);
        enumValueIndexes.forEach((_index: number, enumValue: string) => {
            NetworkUtil.writeString(this, enumValue);
        });

        this.writeUnsignedVarInt(0); // chainedSubCommandValueNameIndexes

        this.writeUnsignedVarInt(postfixIndexes.size);
        postfixIndexes.forEach((_index: number, postfix: string) => {
            NetworkUtil.writeString(this, postfix);
        });

        this.writeUnsignedVarInt(enums.length);
        enums.forEach((_enum: CommandEnum) => {
            this.writeEnum(_enum, enumValueIndexes);
        });

        this.writeUnsignedVarInt(0); // allChainedSubCommandData

        this.writeUnsignedVarInt(this.commandData.length);
        this.commandData.forEach((data: CommandData) => {
            this.writeCommandData(data, enumIndexes, postfixIndexes);
        });

        this.writeUnsignedVarInt(this.softEnums.length);
        this.softEnums.forEach((_enum: CommandEnum) => {
            this.writeSoftEnum(_enum);
        });

        this.writeUnsignedVarInt(this.enumConstraints.length);
        this.enumConstraints.forEach((constraint: CommandEnumConstraint) => {
            this.writeEnumConstraint(constraint, enumIndexes, enumValueIndexes);
        });
    }

    private writeEnum({ name, values }: CommandEnum, enumValueMap: Map<string, number>): void {
        NetworkUtil.writeString(this, name);
        this.writeUnsignedVarInt(values.length);

        values.forEach((value: string) => {
            const index = enumValueMap.get(value) ?? -1;
            if (index === -1) return;
            this.writeEnumValueIndex(index);
        });
    }

    /**
     * An enum's value index, which is a fixed 32 bit little endian integer.
     *
     * It used to be written at whatever width the number of enum values needed - one byte under
     * 256, two under 65536, four beyond - which is how it worked for years. 1.26.50 does not:
     * `CommandEnumContext.Marshal` reads the indices with `FuncSlice(..., Uint32)`, four bytes
     * each, unconditionally. Writing one byte where the client reads four makes it run off the
     * end of the packet, and a packet that ends early is a *malformed* packet to a real client:
     * it drops the connection with `initialconnection-90`, which says only "bad packet" and
     * names nothing. This server's own client never read the packet at all, so nothing caught it.
     * @param {number} index - The position of the value in the shared enum value table.
     */
    private writeEnumValueIndex(index: number): void {
        this.writeUnsignedIntLE(index);
    }

    private writeCommandData(
        data: CommandData,
        enumIndexes: Map<string, number>,
        postfixIndexes: Map<string, number>
    ): void {
        NetworkUtil.writeString(this, data.commandName);
        NetworkUtil.writeString(this, data.commandDescription);
        this.writeShortLE(data.flags);

        // A string, not the byte the permission level is held as. `Command.Marshal` turns the
        // level into one of a fixed set of names and writes that; a client reading a length
        // prefixed string where a bare byte was written takes the next bytes as the string's
        // contents and every field after it is lost.
        NetworkUtil.writeString(this, commandPermissionToString(data.permission));

        if (data.aliases !== null) {
            this.writeIntLE(enumIndexes.get(data.aliases.name) ?? -1);
        } else {
            this.writeIntLE(-1);
        }

        this.writeUnsignedVarInt(0); // chainedSubCommandData

        // The overloads - a command's argument signatures - were stubbed out as a hard zero,
        // with the real writer commented out beneath it. A command with no overloads is one the
        // client will list but cannot call: it has nothing to parse `1` in `/gamemode 1`
        // against, so it never sends the command at all and typing it does nothing. The server
        // has been building these all along (`PlayerSession.sendAvailableCommands`); only this
        // threw them away. Each overload is a chaining flag and then its parameters.
        this.writeUnsignedVarInt(data.overloads.length);
        data.overloads.forEach((overload) => {
            this.writeBoolean(false); // Chaining.
            this.writeUnsignedVarInt(overload.length);

            overload.forEach((parameter) => {
                NetworkUtil.writeString(this, parameter.paramName);

                let type: number = parameter.paramType;
                if (parameter.enum !== null) {
                    const index = enumIndexes.get(parameter.enum.name) ?? 0;
                    type = parameter.enum.soft
                        ? this.ARG_FLAG_SOFT_ENUM | this.ARG_FLAG_VALID | index
                        : this.ARG_FLAG_ENUM | this.ARG_FLAG_VALID | index;
                } else if (parameter.postfix !== null) {
                    type = this.ARG_FLAG_POSTFIX | (postfixIndexes.get(parameter.postfix) ?? 0);
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
        this.writeIntLE(enumValueIndexes.get(constraint.getAffectedValue()) ?? 0);
        this.writeIntLE(enumIndexes.get(constraint.getEnum().name) ?? 0);
        this.writeUnsignedVarInt(constraint.getConstraints().length);
        constraint.getConstraints().forEach((v) => {
            this.writeByte(v);
        });
    }
}
