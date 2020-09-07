const BinaryStream = require('jsbinaryutils')
const NBT = require('jsnamedbinarytag')
const UUID = require('../utils/uuid')
const Skin = require('../utils/skin')
const { FlagType } = require('../entity/metadata')
const CommandOriginData = require('./type/command-origin-data')
const CommandOrigin = require('./type/command-origin')
const NetworkLittleEndianBinaryStream = require('jsnamedbinarytag/streams/network-le-binary-stream')
const CompoundTag = require('jsnamedbinarytag/tags/compound-tag')
const IntTag = require('jsnamedbinarytag/tags/int-tag')

'use strict'

// Class containing packet binary functions 
// for example writeItem()
class PacketBinaryStream extends BinaryStream {

    readString() {
        return this.read(this.readUnsignedVarInt()).toString()
    }

    writeString(v) {
        this.writeUnsignedVarInt(Buffer.byteLength(v))
        this.append(Buffer.from(v, 'utf8'))
    }

    readUUID() {
        let part1 = this.readLInt()
        let part0 = this.readLInt()
        let part3 = this.readLInt()
        let part2 = this.readLInt()

        return new UUID(part0, part1, part2, part3)
    }

    writeUUID(uuid) {
        if (typeof uuid === 'string') {
            uuid = UUID.fromString(uuid)
        }
        this.writeLInt(uuid.parts[1])
        this.writeLInt(uuid.parts[0])
        this.writeLInt(uuid.parts[3])
        this.writeLInt(uuid.parts[2])
    }

    readSkin() {
        let skin = new Skin()
        skin.skinId = this.readString()
        skin.skinResourcePatch = this.readString()
        skin.skinImageWidth = this.readLInt()
        skin.skinImageHeight = this.readLInt()
        skin.skinData = this.readString()
        
        // Read animations
        let animationCount = this.readLInt()
        for (let i = 0; i < animationCount; i++) {
            // Names are from LoginPacket skin
            skin.animations.push({
                ImageWidth: this.readLInt(),
                ImageHeight: this.readLInt(),
                Image: this.readString(),
                Type: this.readLInt(),
                Frames: this.readLFloat()
            })
        }

        skin.capeImageWidth = this.readLInt()
        skin.capeImageHeight = this.readLInt()
        skin.capeData = this.readString()
        skin.skinGeometry = this.readString()
        skin.animationData = this.readString()
        skin.premium = this.readBool()
        skin.persona = this.readBool()
        skin.capeOnClassicSkin = this.readBool()
        skin.capeId = this.readString()
        skin.fullId = this.readString()
        skin.armSize = this.readString()
        skin.skinColor = this.readString()
        
        // Read persona pieces
        let personaPieceCount = this.readLInt()
        for (let i = 0; i < personaPieceCount; i++) {
            skin.personaPieces.push({
                PieceID: this.readString(),
                PieceType: this.readString(),
                PackID: this.readString(),
                IsDefault: this.readBool(),
                ProductID: this.readString()
            })
        }

        // Read piece tint colors
        let pieceTintColors = this.readLInt()
        for (let i = 0; i < pieceTintColors; i++) {
            let type = this.readString()
            let colorsCount = this.readLInt()
            let colors = []
            for (let c = 0; c < colorsCount; c++) {
                colors.push(this.readString())
            }
            skin.pieceTintColors.push({
                PieceType: type,
                Colors: colors
            })
        }
        return skin
    }

    /**
     * @param {Skin} skin 
     */
    writeSkin(skin) {
        this.writeString(skin.skinId)
        this.writeString(skin.skinResourcePatch)
        this.writeLInt(skin.skinImageWidth)
        this.writeLInt(skin.skinImageHeight)
        this.writeString(skin.skinData)
        this.writeLInt(skin.animations.length)
        for (let animation of skin.animations) {
            this.writeLInt(animation.ImageWidth)
            this.writeLInt(animation.ImageHeight)
            this.writeString(animation.Image)
            this.writeLInt(animation.Type)
            this.writeLFloat(animation.Frames)
        }
        this.writeLInt(skin.capeImageWidth)
        this.writeLInt(skin.capeImageHeight)
        this.writeString(skin.capeData)
        this.writeString(skin.skinGeometry)
        this.writeString(skin.animationData)
        this.writeBool(skin.premium)
        this.writeBool(skin.persona)
        this.writeBool(skin.capeOnClassicSkin)
        this.writeString(skin.capeId)
        this.writeString(skin.fullId)
        this.writeString(skin.armSize)
        this.writeString(skin.skinColor)
        this.writeLInt(skin.personaPieces.length)
        for (let personaPiece of skin.personaPieces) {
            this.writeString(personaPiece.PieceId)
            this.writeString(personaPiece.PieceType)
            this.writeString(personaPiece.PackId)
            this.writeBool(personaPiece.IsDefault)
            this.writeString(personaPiece.ProductId)
        }
        this.writeLInt(skin.pieceTintColors.length)
        for (let tint of skin.pieceTintColors) {
            this.writeString(tint.PieceType)
            this.writeLInt(tint.Colors.length) 
            for (let color of tint.Colors) {
                this.writeString(color)
            }
        }
    }

    writePlayerAddEntry(entry) {
        this.writeUUID(entry.uuid) 
        this.writeVarLong(entry.uniqueEntityId)
        this.writeString(entry.name) 
        this.writeString(entry.xuid)
        this.writeString(entry.platformChatId)
        this.writeLInt(entry.buildPlatform)
        this.writeSkin(entry.skin)
        this.writeBool(entry.teacher)
        this.writeBool(entry.host)
    }

    writePlayerRemoveEntry(entry) {
        this.writeUUID(entry.uuid)
    }

    writeAttributes(attributes) {
        this.writeUnsignedVarInt(attributes.length)
        for (let attribute of attributes) {
            this.writeLFloat(attribute.min)
            this.writeLFloat(attribute.max)
            this.writeLFloat(attribute.value)
            this.writeLFloat(attribute.default)
            this.writeString(attribute.name)
        }
    }

    writeEntityMetadata(metadata) {
        this.writeUnsignedVarInt(metadata.size)
        for (const [index, value] of metadata) {
            this.writeUnsignedVarInt(index)
            this.writeUnsignedVarInt(value[0])
            switch(value[0]) {
                case FlagType.Byte:
                    this.writeByte(value[1])
                    break
                case FlagType.Float:
                    this.writeLFloat(value[1])
                    break
                case FlagType.Long:
                    this.writeVarLong(value[1])    
                    break
                case FlagType.String:
                    this.writeString(value[1])
                    break
                case FlagType.Short:
                    this.writeLShort(value[1])
                    break        
                default:
                    console.log(`Unknown meta type ${value}`)    
            } 
        } 
    }

    readItemStack() {
        let id = this.readVarInt()
        if (id == 0) {
            // TODO: items
            return {id: 0, data: 0, amount: 0}
        }

        let temp = this.readVarInt()
        let amount = (temp & 0xff) 
        let data = (temp >> 8)  

        let extraLen = this.readLShort()
        let nbt = null
        if (extraLen == 0xffff) {
            this.readByte()  // ? nbt version
            // As i cannot pass offset by reference, i keep it using this binary stream directly
            let stream = new NetworkLittleEndianBinaryStream(this.buffer, this.offset)
            let decodedNBT = (new NBT()).readTag(stream, true, true)
            if (!(decodedNBT instanceof CompoundTag)) {
                throw new Error('Invalid NBT root tag for itemstack')
            }
            nbt = decodedNBT
            this.offset = stream.offset
        } else if (extraLen !== 0) {
            throw new Error(`Invalid NBT itemstack length ${extraLen}`)
        }
        
        let countPlaceOn = this.readVarInt()
        for (let i = 0; i < countPlaceOn; i++) {
            this.readString()
        }

        let countCanBreak = this.readVarInt()
        for (let i = 0; i < countCanBreak; i++) {
            this.readString()
        }
        
        // TODO: check if has other tags
        /* if (nbt !== null) {
            if (nbt.hasTag('Damage', IntTag)) {

            }
        } */

        return {id: id, data: data, count: amount, nbt: nbt}
    }

    readCommandOriginData() {
        let data = new CommandOriginData()
        data.type = this.readUnsignedVarInt()
        data.uuid = this.readUUID()
        data.requestId = this.readString()

        if (data.type === CommandOrigin.DevConsole || 
            data.type === CommandOrigin.Test) {
            data.uniqueEntityId = this.readVarLong()
        }
        return data
    }

}   
module.exports = PacketBinaryStream