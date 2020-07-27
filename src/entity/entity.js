const Vector3 = require('../math/vector3')
const { MetadataManager, MetaFlags, FlagType} = require('./metadata')

'use strict'

// All entities will extend this base class
class Entity extends Vector3 {

    static runtimeIdCount = 0

    runtimeId

    metadata = new MetadataManager()

    constructor() {
        super()
        this.runtimeId = Entity.runtimeIdCount += 1

        this.metadata.setLong(MetaFlags.Index, 0)
        this.metadata.setShort(MetaFlags.MaxAir, 400)
        this.metadata.setLong(MetaFlags.EntityLeadHolderId, -1)
        this.metadata.setFloat(MetaFlags.Scale, 1)
        this.metadata.setFloat(MetaFlags.BoundingBoxWidth, 0.6)
        this.metadata.setFloat(MetaFlags.BoundingBoxHeight, 1.8)
        this.metadata.setShort(MetaFlags.Air, 0) 

        // TODO: fix broken writeVarLong
        // this.setGenericFlag(MetaFlags.AffectedByGravity, true)
        // this.setGenericFlag(MetaFlags.HasCollision, true)
    }

    setNameTag(name) {
        this.metadata.setString(MetaFlags.Nametag, name)
    }

    setDataFlag(propertyId, flagId, value = true, propertyType = FlagType.Long) {
        if (this.getDataFlag(propertyId, flagId) !== value) {
            let flags = this.metadata.getPropertyValue(propertyId, propertyType)
            console.log(flags)
            flags ^= 1 << flagId
            this.metadata.setPropertyValue(propertyId, propertyType, flags)
        }
    }

    getDataFlag(propertyId, flagId) {
        return (this.metadata.getPropertyValue(propertyId, -1) & (1 << flagId)) > 0
    }

    setGenericFlag(flagId, value = true) {
        this.setDataFlag(flagId >= 64 ? 94 : MetaFlags.Index, flagId % 64, value, FlagType.Long)
    }

}
module.exports = Entity