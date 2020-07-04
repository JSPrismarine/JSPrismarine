const BinaryStream = require('jsbinaryutils')
const UUID = require('../utils/uuid')
const Skin = require('../utils/skin')

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
                Default: this.readBool(),
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

}   
module.exports = PacketBinaryStream