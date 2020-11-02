const DataPacket = require('./Packet').default;
const Identifiers = require('../Identifiers').default;
const CommandEnum = require('../type/CommandEnum');
const CommandData = require('../type/CommandData');


class AvailableCommandsPacket extends DataPacket {
    static NetID = Identifiers.AvailableCommandsPacket

    /** @type {Set<String>} */
    enumValues = new Set()
    /** @type {Set<String>} */
    postFixes = new Set()
    /** @type {Set<CommandEnum>} */
    enums = new Set()
    /** @type {Set<CommandData>} */
    commandData = new Set()

    encodePayload() {
        // Write enum values
        this.writeUnsignedVarInt(this.enumValues.size);
        for (let enumValue of this.enumValues) {
            this.writeString(enumValue);
        }

        // Write postfix data
        this.writeUnsignedVarInt(this.postFixes.size);
        for (let postFix of this.postFixes) {
            this.writeString(postFix);
        }

        // Write enum indexes
        this.writeUnsignedVarInt(this.enums.size);
        for (let enumIndex of this.enums) {
            this.writeString(enumIndex.enumName);

            this.writeUnsignedVarInt(enumIndex.enumValues.length);
            for (let enumValue of enumIndex.enumValues) {
                // TODO: complete this WIP part
                // console.log(enumValue) // eslint-disable-line
            }
        }

        // Write command data
        this.writeUnsignedVarInt(this.commandData.size);
        for (let data of this.commandData) {
            // Command meta
            this.writeString(data.name);
            this.writeString(data.description);

            // Flags
            this.writeByte(data.flags);
            this.writeByte(data.permission);

            // Alias enum indexes
            this.writeLInt(-1);  // TODO

            // Parameters and overloads
            this.writeUnsignedVarInt(1);  // i don't get it, why ??
            this.writeUnsignedVarInt(data?.parameters?.size || 0);
            if (data?.parameters)
                for (let parameter of data.parameters) {
                    this.writeString(parameter.name);
                    this.writeLInt(parameter.type);
                    this.writeBool(parameter.optional);
                    this.writeByte(0);  // No idea
                }
        }

        this.writeUnsignedVarInt(0);
        this.writeUnsignedVarInt(0);
    }

}
module.exports = AvailableCommandsPacket;
