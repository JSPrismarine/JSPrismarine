import CommandData from '../type/CommandData';
import CommandEnum from '../type/CommandEnum';
import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class AvailableCommandsPacket extends DataPacket {
    public static NetID = Identifiers.AvailableCommandsPacket;

    public enumValues: Set<string> = new Set();
    public postFixes: Set<string> = new Set();
    public enums: Set<CommandEnum> = new Set();
    public commandData: Set<CommandData> = new Set();

    public encodePayload() {
        // Write enum values
        this.writeUnsignedVarInt(this.enumValues.size);
        for (const enumValue of this.enumValues) {
            this.writeString(enumValue);
        }

        // Write postfix data
        this.writeUnsignedVarInt(this.postFixes.size);
        for (const postFix of this.postFixes) {
            this.writeString(postFix);
        }

        // Write enum indexes
        this.writeUnsignedVarInt(this.enums.size);
        for (const enumIndex of this.enums) {
            this.writeString(enumIndex.enumName);

            this.writeUnsignedVarInt(enumIndex.enumValues.length);
            // For (let enumValue of enumIndex.enumValues) {
            // TODO: complete this WIP part
            // console.log(enumValue) // eslint-disable-line
            // }
        }

        // Write command data
        this.writeUnsignedVarInt(this.commandData.size);
        for (const data of this.commandData) {
            // Command meta
            this.writeString(data.name);
            this.writeString(data.description ?? '');

            // Flags
            this.writeByte(data.flags ?? 0);
            this.writeByte(data.permission as any);

            // Alias enum indexes
            this.writeLInt(-1); // TODO

            // Parameters and overloads
            this.writeUnsignedVarInt(1); // I don't get it, why ??
            this.writeUnsignedVarInt(data?.parameters?.size ?? 0);
            if (data?.parameters)
                for (const parameter of data.parameters) {
                    this.writeString(parameter.name);
                    this.writeLInt(parameter.type);
                    this.writeBool(parameter.optional);
                    this.writeByte(0); // No idea
                }
        }

        this.writeUnsignedVarInt(0);
        this.writeUnsignedVarInt(0);
    }
}
