const BinaryStream = require('jsbinaryutils')
const NBT = require('jsnamedbinarytag')
const UUID = require('../utils/uuid')
const Skin = require('../utils/skin/skin')
const { FlagType } = require('../entity/metadata')
const CommandOriginData = require('./type/command-origin-data')
const CommandOrigin = require('./type/command-origin')
const NetworkLittleEndianBinaryStream = require('jsnamedbinarytag/streams/network-le-binary-stream')
const CompoundTag = require('jsnamedbinarytag/tags/compound-tag')
const SkinImage = require('../utils/skin/skin-image')
const PlayerListEntry = require('./type/player-list-entry')
const SkinAnimation = require('../utils/skin/skin-animation')
const SkinCape = require('../utils/skin/skin-cape')
const SkinPersonaPiece = require('../utils/skin/skin-persona/persona-piece')
const SkinPersona = require('../utils/skin/skin-persona/persona')
const SkinPersonaPieceTintColor = require('../utils/skin/skin-persona/piece-tint-color')

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
        skin.id = this.readString()
        skin.resourcePatch = this.readString()
        
        // Read skin image
        skin.image = new SkinImage({
            width: this.readLInt(),
            height: this.readLInt(),
            data: this.readString()
        })
        
        
        // Read animations
        let animationCount = this.readLInt()
        for (let i = 0; i < animationCount; i++) {
            skin.animations.add(new SkinAnimation({
                image: new SkinImage({
                    width: this.readLInt(),
                    height: this.readLInt(),
                    data: this.readString()
                }),
                frames: this.readLFloat(),
                type: this.readLInt()
            }))
        }

        // Read cape image 
        skin.cape = new SkinCape()
        skin.cape.image = new SkinImage({
            width: this.readLInt(),
            height: this.readLInt(),
            data: this.readString()
        })

        // Miscellaneus
        skin.geometry = this.readString()
        skin.animationData = this.readString()
        skin.isPersona = this.readBool()
        skin.isPersona = this.readBool()
        skin.isCapeOnClassicSkin = this.readBool()
        skin.cape.id = this.readString()
        skin.fullId = this.readString()
        skin.armSize = this.readString()
        skin.color = this.readString()

        // Avoid reading useless data
        if (skin.isPersona) {
            skin.persona = new SkinPersona()

            // Read persona pieces
            let personaPieceCount = this.readLInt()
            for (let i = 0; i < personaPieceCount; i++) {
                skin.persona.pieces.add(new SkinPersonaPiece({
                    pieceId: this.readString(),
                    pieceType: this.readString(),
                    packId: this.readString(),
                    isDefault: this.readBool(),
                    productId: this.readString()
                }))
            }

            // Read piece tint colors
            let pieceTintColors = this.readLInt()
            for (let i = 0; i < pieceTintColors; i++) {
                let pieceTintColor = new SkinPersonaPieceTintColor()
                pieceTintColor.pieceType = this.readString()
                let colorsCount = this.readLInt()
                for (let c = 0; c < colorsCount; c++) {
                    pieceTintColor.colors.push(this.readString())
                }
                skin.persona.tintColors.add(pieceTintColor)
            }
        }

        return skin
    }

    /**
     * @param {Skin} skin
     */
    writeSkin(skin) {
        this.writeString(skin.id)
        this.writeString(skin.resourcePatch)

        // Skin image
        this.writeSkinImage(skin.image)

        // Animations
        this.writeLInt(skin.animations.size)
        for (let animation of skin.animations) {
            this.writeSkinImage(animation.image)
            this.writeLInt(animation.type)
            this.writeLFloat(animation.frames)
        }

        // Cape image
        this.writeSkinImage(skin.cape.image)

        // Miscellaneus
        this.writeString(skin.geometry)
        this.writeString(skin.animationData)
        this.writeBool(skin.isPremium)
        this.writeBool(skin.isPersona)
        this.writeBool(skin.isCapeOnClassicSkin)
        this.writeString(skin.cape.id)
        this.writeString(skin.fullId)
        this.writeString(skin.armSize)
        this.writeString(skin.color)

        // Hack to keep less useless data in software 
        if (skin.isPersona) {
            this.writeLInt(skin.persona.pieces.size)
            for (let personaPiece of skin.persona.pieces) {
                this.writeString(personaPiece.pieceId)
                this.writeString(personaPiece.pieceType)
                this.writeString(personaPiece.packId)
                this.writeBool(personaPiece.isDefault)
                this.writeString(personaPiece.productId)
            }
            this.writeLInt(skin.persona.tintColors.size)
            for (let tint of skin.persona.tintColors) {
                this.writeString(tint.pieceType)
                this.writeLInt(tint.colors.length) 
                for (let color of tint.colors) {
                    this.writeString(color)
                }
            }
        } else {
            this.writeLInt(0)  // Persona pieces
            this.writeLInt(0)  // Tint colors
        }
    }

    /**
     * @param {SkinImage} image 
     */
    writeSkinImage(image) {
        this.writeLInt(image.width)
        this.writeLInt(image.height)
        this.writeString(image.data)
    }

    /**
     * @param {PlayerListEntry} entry 
     */
    writePlayerAddEntry(entry) {
        this.writeUUID(entry.uuid) 
        this.writeVarLong(entry.uniqueEntityId)
        this.writeString(entry.name) 
        this.writeString(entry.xuid)
        this.writeString(entry.platformChatId)
        this.writeLInt(entry.buildPlatform)
        this.writeSkin(entry.skin)
        this.writeBool(entry.isTeacher)
        this.writeBool(entry.isHost)
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