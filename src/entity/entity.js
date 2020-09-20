const { MetadataManager, MetadataFlag, FlagType} = require('./metadata')
const { AttributeManager } = require('./attribute')
const World = require('../world/world')
const Position = require('../world/position')
const AddActorPacket = require('../network/packet/add-actor')

'use strict'

// All entities will extend this base class
class Entity extends Position {
    static MOB_ID = -1
    static runtimeIdCount = 0

    /** @type {number} */
    runtimeId

    metadata = new MetadataManager()
    attributes = new AttributeManager()

    chunk

    /**
     * Entity constructor.
     * 
     * @param {World} world 
     */
    constructor(world) {
        super(undefined, undefined, undefined, world)  // TODO
        this.runtimeId = Entity.runtimeIdCount += 1

        this.metadata.setLong(MetadataFlag.Index, 0)
        this.metadata.setShort(MetadataFlag.MaxAir, 400)
        this.metadata.setLong(MetadataFlag.EntityLeadHolderId, -1)
        this.metadata.setFloat(MetadataFlag.Scale, 1)
        this.metadata.setFloat(MetadataFlag.BoundingBoxWidth, 0.6)
        this.metadata.setFloat(MetadataFlag.BoundingBoxHeight, 1.8)
        this.metadata.setShort(MetadataFlag.Air, 0) 

        this.setGenericFlag(MetadataFlag.AffectedByGravity, true)
        this.setGenericFlag(MetadataFlag.HasCollision, true)

        // TODO: level.addEntity(this)
    }

    setNameTag(name) {
        this.metadata.setString(MetadataFlag.Nametag, name)
    }

    setDataFlag(propertyId, flagId, value = true, propertyType = FlagType.Long) {
        if (this.getDataFlag(propertyId, flagId) !== value) {
            let flags = this.metadata.getPropertyValue(propertyId, propertyType)
            let biFlags = BigInt(flags)
            biFlags ^= (1n << BigInt(flagId))
            this.metadata.setPropertyValue(propertyId, propertyType, biFlags)
        }
    }

    getDataFlag(propertyId, flagId) {
        // After appending the first flag, it is now a bigint and for further flags
        // we need to handle it like that
        if (typeof this.metadata.getPropertyValue(propertyId) === 'bigint') {
            return (this.metadata.getPropertyValue(propertyId) & (1n << BigInt(flagId))) > 0
        } 
        return (this.metadata.getPropertyValue(propertyId) & (1 << flagId)) > 0
    }

    setGenericFlag(flagId, value = true) {
        this.setDataFlag(flagId >= 64 ? 94 : MetadataFlag.Index, flagId % 64, value, FlagType.Long)
    }

    sendSpawn(player) {
        let pk = new AddActorPacket()
        pk.runtimeEntityId = Entity.runtimeIdCount += 1
        pk.type = this.constructor.MOB_ID
        pk.x = player.x
        pk.y = player.y
        pk.z = player.z
        // TODO: motion
        pk.motionX = 0 
        pk.motionY = 0
        pk.motionZ = 0
        player.sendDataPacket(pk)
    }

}
module.exports = Entity