const jwt_decode = require('jwt-decode')

const DataPacket = require('./packet')
const BinaryStream = require('jsbinaryutils')
const Skin = require('../../utils/skin')
const Identifiers = require('../identifiers')

'use strict'

class LoginPacket extends DataPacket {
    static NetID = Identifiers.LoginPacket

    XUID
    identity
    disaplayName
    protocol
    identityPublicKey

    clientRandomId
    serverAddress
    languageCode

    deviceOS
    deviceId
    deviceModel

    // Computed
    skin

    decodePayload() {
        this.protocol = this.readInt()

        let stream = new BinaryStream(this.read(this.readUnsignedVarInt()))
        let chainData = JSON.parse(stream.read(stream.readLInt()).toString())

        for (let chain of chainData.chain) {
            let decodedChain = jwt_decode(chain)

            if (decodedChain.extraData) {
                this.XUID = decodedChain.extraData.XUID
                this.identity = decodedChain.extraData.identity
                this.displayName = decodedChain.extraData.displayName
            }

            this.identityPublicKey = decodedChain.identityPublicKey
        }

        let decodedJWT = jwt_decode(stream.read(stream.readLInt()).toString())

        // Skin data
        let animations = []
        for (let animation of decodedJWT.AnimatedImageData) {
            animations.push(animation)
        }

        let personaPieces = []
        for (let personaPiece of decodedJWT.PersonaPieces) {
            personaPieces.push(personaPiece)
        }

        let pieceTintColors = []
        for (let pieceTintColor of decodedJWT.PieceTintColors) {
            pieceTintColors.push(pieceTintColor)
        }
        
        // Sometimes using a constructor is a bad idea...
        // will be splitted in smaller class soon
        let skin = new Skin()
        skin.skinId = decodedJWT.SkinId
        skin.skinResourcePatch = Buffer.from(decodedJWT.SkinResourcePatch, 'base64')
        skin.skinImageWidth = decodedJWT.SkinImageWidth
        skin.skinImageHeight = decodedJWT.SkinImageHeight
        skin.skinData = Buffer.from(decodedJWT.SkinData, 'base64')
        skin.animations = animations
        skin.capeImageWidth = decodedJWT.CapeImageWidth
        skin.capeImageHeight = decodedJWT.CapeImageHeight
        skin.capeData = Buffer.from(decodedJWT.CapeData, 'base64')
        skin.skinGeometry = Buffer.from(decodedJWT.SkinGeometryData, 'base64')
        skin.animationData = Buffer.from(decodedJWT.SkinAnimationData, 'base64')
        skin.premium = decodedJWT.PremiumSkin
        skin.persona = decodedJWT.PersonaSkin
        skin.capeOnClassicSkin = decodedJWT.CapeOnClassicSkin
        skin.capeId = decodedJWT.CapeId
        skin.skinColor = decodedJWT.SkinColor
        skin.armSize = decodedJWT.ArmSize
        skin.personaPieces = personaPieces
        skin.pieceTintColors = pieceTintColors
        skin.fullId = skin.capeId + skin.skinId  // Computed
        this.skin = skin

        this.deviceId = decodedJWT.DeviceId
        this.deviceOS = decodedJWT.DeviceOS
        this.deviceModel = decodedJWT.DeviceModel

        this.clientRandomId = decodedJWT.ClientRandomId
        this.serverAddress = decodedJWT.ServerAddress
        this.languageCode = decodedJWT.LanguageCode
    }
}
module.exports = LoginPacket