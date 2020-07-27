const Vector3 = require('../math/vector3')
const { MetadataManager, MetadataFlag, FlagType} = require('./metadata')
const { AttributeManager } = require('./attribute')

'use strict'

// All entities will extend this base class
class Entity extends Vector3 {

    static runtimeIdCount = 0

    /** @type {number} */
    runtimeId

    metadata = new MetadataManager()
    attributes = new AttributeManager()

    constructor() {
        super()
        this.runtimeId = Entity.runtimeIdCount += 1

        this.metadata.setLong(MetadataFlag.Index, 0)
        this.metadata.setShort(MetadataFlag.MaxAir, 400)
        this.metadata.setLong(MetadataFlag.EntityLeadHolderId, -1)
        this.metadata.setFloat(MetadataFlag.Scale, 1)
        this.metadata.setFloat(MetadataFlag.BoundingBoxWidth, 0.6)
        this.metadata.setFloat(MetadataFlag.BoundingBoxHeight, 1.8)
        this.metadata.setShort(MetadataFlag.Air, 0) 

        this.setGenericFlag(MetadataFlag.AffectedByGravity, true)
        // this.setGenericFlag(MetadataFlag.HasCollision, true)
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
        return (this.metadata.getPropertyValue(propertyId, -1) & (1 << flagId)) > 0
    }

    setGenericFlag(flagId, value = true) {
        this.setDataFlag(flagId >= 64 ? 94 : MetadataFlag.Index, flagId % 64, value, FlagType.Long)
    }

}
module.exports = Entity