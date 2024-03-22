import CommandData from '../type/CommandData';
import CommandEnum from '../type/CommandEnum';
import CommandEnumConstraint from '../type/CommandEnumConstraint';
import CommandParameter from '../type/CommandParameter';
import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import McpeUtil from '../NetworkUtil';

export default class AvailableCommandsPacket extends DataPacket {
    public static NetID = Identifiers.AvailableCommandsPacket;

    public ARG_FLAG_VALID = 0x100000;
    public ARG_FLAG_ENUM = 0x200000;
    public ARG_FLAG_POSTFIX = 0x1000000;
    public commandData: CommandData[] = [];
    public hardcodedEnums: CommandEnum[] = [];
    public softEnums: CommandEnum[] = [];
    public enumConstraints: CommandEnumConstraint[] = [];

    public encodePayload() {
        const enumValueIndexes: Map<string, number> = new Map<string, number>();
        const postfixIndexes: Map<string, number> = new Map<string, number>();
        const enumIndexes: Map<string, number> = new Map<string, number>();
        const enums: Map<number, CommandEnum> = new Map<number, CommandEnum>();
        const addEnumFn = (_enum: CommandEnum): void => {
            if (!enumIndexes.has(_enum.enumName)) {
                enums.set(
                    enumIndexes.set(_enum.enumName, enumIndexes.size).get(_enum.enumName) ?? enumIndexes.size,
                    _enum
                );
            }
            _enum.enumValues.forEach((str: string) => {
                enumValueIndexes.set(str, enumValueIndexes.get(str) ?? enumValueIndexes.size);
            });
        };
        this.hardcodedEnums.forEach((_enum: CommandEnum) => {
            addEnumFn(_enum);
        });
        this.commandData.forEach((commandData: CommandData) => {
            if (commandData.aliases !== null) {
                addEnumFn(commandData.aliases);
            }
            commandData.overloads.forEach((overload: CommandParameter[]) => {
                overload.forEach((parameter: CommandParameter) => {
                    if (parameter.enum !== null) {
                        addEnumFn(parameter.enum);
                    }
                    if (parameter.postfix !== null) {
                        postfixIndexes.set(
                            parameter.postfix,
                            postfixIndexes.get(parameter.postfix) ?? postfixIndexes.size
                        );
                    }
                });
            });
        });
        this.writeUnsignedVarInt(enumValueIndexes.size);
        enumValueIndexes.forEach((_index: number, enumValue: string) => {
            McpeUtil.writeString(this, enumValue);
        });
        this.writeUnsignedVarInt(postfixIndexes.size);
        postfixIndexes.forEach((_index: number, postfix: string) => {
            McpeUtil.writeString(this, postfix);
        });
        this.writeUnsignedVarInt(enums.size);
        enums.forEach((_enum: CommandEnum) => {
            this.writeEnum(_enum, enumValueIndexes);
        });
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

    private writeEnum(_enum: CommandEnum, enumValueMap: Map<string, number>): void {
        McpeUtil.writeString(this, _enum.enumName);
        this.writeUnsignedVarInt(_enum.enumValues.length);
        const listSize = enumValueMap.size;
        _enum.enumValues.forEach((value: string) => {
            const index = enumValueMap.get(value) ?? -1;
            if (index === -1) {
                throw new Error(`Enum value '${value}' not found`);
            }
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
        postfixIndexes: Map<string, number>
    ): void {
        McpeUtil.writeString(this, data.commandName);
        McpeUtil.writeString(this, data.commandDescription);
        this.writeUnsignedShortLE(data.flags);
        this.writeByte(data.permission);
        if (data.aliases !== null) {
            this.writeIntLE(enumIndexes.get(data.aliases.enumName) ?? -1);
        } else {
            this.writeIntLE(-1);
        }
        this.writeUnsignedVarInt(data.overloads.length);
        data.overloads.forEach((overload: CommandParameter[]) => {
            this.writeUnsignedVarInt(overload.length);
            overload.forEach((parameter: CommandParameter) => {
                McpeUtil.writeString(this, parameter.paramName);
                let type;
                if (parameter.enum !== null) {
                    type = this.ARG_FLAG_ENUM | this.ARG_FLAG_VALID | (enumIndexes.get(parameter.enum.enumName) ?? -1);
                } else if (parameter.postfix !== null) {
                    const key = postfixIndexes.get(parameter.postfix) ?? -1;
                    if (key === -1) {
                        throw new Error(`Postfix '${parameter.postfix}' not in postfixes array`);
                    }
                    type = this.ARG_FLAG_POSTFIX | key;
                } else {
                    type = parameter.paramType;
                }
                this.writeIntLE(type);
                this.writeBoolean(parameter.isOptional);
                this.writeByte(parameter.flags);
            });
        });
    }

    private writeSoftEnum(_enum: CommandEnum): void {
        McpeUtil.writeString(this, _enum.enumName);
        this.writeUnsignedVarInt(_enum.enumValues.length);
        _enum.enumValues.forEach((value: string) => {
            McpeUtil.writeString(this, value);
        });
    }

    private writeEnumConstraint(
        constraint: CommandEnumConstraint,
        enumIndexes: Map<string, number>,
        enumValueIndexes: Map<string, number>
    ): void {
        this.writeIntLE(enumValueIndexes.get(constraint.getAffectedValue()) ?? 0);
        this.writeIntLE(enumIndexes.get(constraint.getEnum().enumName) ?? 0);
        this.writeUnsignedVarInt(constraint.getConstraints().length);
        constraint.getConstraints().forEach((v: any) => {
            this.writeByte(v);
        });
    }
}
