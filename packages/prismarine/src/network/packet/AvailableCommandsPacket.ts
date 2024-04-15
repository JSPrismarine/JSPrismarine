import { NetworkUtil } from '../../network/NetworkUtil';
import Identifiers from '../Identifiers';
import type CommandData from '../type/CommandData';
import type { CommandEnum } from '../type/CommandEnum';
import type CommandEnumConstraint from '../type/CommandEnumConstraint';
import DataPacket from './DataPacket';

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

    public encodePayload() {
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

        const listSize = enumValueMap.size;
        values.forEach((value: string) => {
            const index = enumValueMap.get(value) ?? -1;
            if (index === -1) return;
            this.writeEnumValueIndex(index, listSize);
        });
    }

    private writeEnumValueIndex(index: number, valueCount: number): void {
        if (valueCount < 256) {
            this.writeByte(index);
        } else if (valueCount < 65536) {
            this.writeUnsignedShortLE(index);
        } else {
            this.writeUnsignedIntLE(index);
        }
    }

    private writeCommandData(
        data: CommandData,
        enumIndexes: Map<string, number>,
        _postfixIndexes: Map<string, number>
    ): void {
        NetworkUtil.writeString(this, data.commandName);
        NetworkUtil.writeString(this, data.commandDescription);
        this.writeShortLE(data.flags);
        this.writeByte(data.permission);

        if (data.aliases !== null) {
            this.writeIntLE(enumIndexes.get(data.aliases.name) ?? -1);
        } else {
            this.writeIntLE(-1);
        }

        this.writeUnsignedVarInt(0); // chainedSubCommandData

        this.writeUnsignedVarInt(0);
        /*this.writeUnsignedVarInt(data.overloads.length);
        data.overloads.forEach((overload) => {
            this.writeUnsignedVarInt(overload.length);
            overload.forEach((parameter) => {
                NetworkUtil.writeString(this, parameter.paramName);

                let type = parameter.paramType;
                if (parameter.enum !== null) {
                    if (parameter.enum.soft) {
                        type =
                            this.ARG_FLAG_SOFT_ENUM |
                            this.ARG_FLAG_VALID |
                            (enumIndexes.get(parameter.enum.name) ?? -1);
                    } else {
                        type = this.ARG_FLAG_ENUM | this.ARG_FLAG_VALID | (enumIndexes.get(parameter.enum.name) ?? -1);
                    }
                } else if (parameter.postfix !== null) {
                    const key = postfixIndexes.get(parameter.postfix) ?? -1;
                    if (key === -1) return;
                    type = this.ARG_FLAG_POSTFIX | key;
                }

                this.writeIntLE(type);
                this.writeBoolean(parameter.isOptional);
                this.writeByte(parameter.flags);
            });
        });*/
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
