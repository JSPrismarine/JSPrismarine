const fs = require('fs')

const DataPacket = require('./data_packet')
const ItemTable = require('../../resources/item_id_map.json')
const PacketBinaryStream = require('../packet_binary_stream')
const Identifiers = require('../identifiers')

'use strict'

class StartGamePacket extends DataPacket {
    static NetID = Identifiers.StartGamePacket

    entityId
    runtimeEntityId

    encodePayload() {
        this.writeVarLong(this.entityId)
        this.writeUnsignedVarLong(this.runtimeEntityId)

        this.writeVarInt(0) // game mode

        // vector 3
        this.writeLFloat(0)
        this.writeLFloat(4)
        this.writeLFloat(0)

        this.writeLFloat(0) // pitch
        this.writeLFloat(0) // yaw

        this.writeVarInt(0) //  seed

        this.writeLShort(0) // default biome type
        this.writeString('plains') // biome name
        this.writeVarInt(0) // dimension

        this.writeVarInt(2) // generator
        this.writeVarInt(0)
        this.writeVarInt(0) // difficulty

        // world spawn vector 3
        this.writeVarInt(0)
        this.writeUnsignedVarInt(4)
        this.writeVarInt(0)

        this.writeByte(1) // achievement disabled

        this.writeVarInt(0) // day cycle / time
        this.writeVarInt(0) // edu edition offer
        this.writeByte(0) // edu features
        this.writeString('') // edu product id

        this.writeLFloat(0) // rain lvl
        this.writeLFloat(0) // lightning lvl

        this.writeByte(0) // confirmed platform locked
        this.writeByte(1) // multi player game
        this.writeByte(1) // broadcast to lan

        this.writeVarInt(4) // xbl broadcast mode
        this.writeVarInt(4) // platform broadcast mode

        this.writeByte(1) // commands enabled
        this.writeByte(0) // texture required

        this.writeUnsignedVarInt(0) // game rules length
        // this.writeGameRules(this.gameRules);

        this.writeByte(0) // bonus chest
        this.writeByte(0) // start with chest

        this.writeVarInt(1) // player perms

        this.writeLInt(4) // chunk tick range
        this.writeByte(0) // locked behavior
        this.writeByte(0) // locked texture
        this.writeByte(0) // from locked template
        this.writeByte(0) // msa gamer tags only
        this.writeByte(0) // from world template
        this.writeByte(0) // world template option locked
        this.writeByte(1) // only spawn v1 villagers
        this.writeString('1.16.0') // vanilla version
        this.writeLInt(0) // limited world height
        this.writeLInt(0) // limited world length
        this.writeBool(false) // has new nether
        this.writeBool(false) // experimental gameplay

        this.writeString('') // random level uuid
        this.writeString('test') // world name
        this.writeString('') // template content identity

        this.writeByte(0) // is trial
        this.writeByte(0) // server auth movement
        this.writeLLong(BigInt(0)) // level time

        this.writeVarInt(0) // enchantment seed

        // PMMP states
        this.append(fs.readFileSync(__dirname + '/../../resources/states.nbt'))

        this.append(this.serializeItemTable(ItemTable))

        this.writeString('')
        this.writeBool(false) 
    }

    serializeItemTable(table) {
        let stream = new PacketBinaryStream()
        stream.writeUnsignedVarInt(Object.entries(table).length)
        for (const [name, legacyId] of Object.entries(table)) {
            stream.writeString(name)
            stream.writeLShort(legacyId)
        }
        return stream.buffer
    }

}
module.exports = StartGamePacket