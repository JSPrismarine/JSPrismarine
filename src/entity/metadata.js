'use strict'

// TODO: Still missing flags
const MetaFlags = {
    Index: 0,
    Health: 1,
    Variant: 2,
    Color: 3,
    Nametag: 4,
    EntityOwnerId: 5,
    EntityTargetId: 6,
    Air: 7,
    PotionColor: 8,
    Ambient: 9,
    HurtTime: 11,
    HurtDirection: 12,
    PaddleTimeLeft: 13,
    PaddleTimeRight: 14,
    ExperienceValue: 15,
    PlayerIndex: 27,
    EntityLeadHolderId: 37,
    Scale: 38,
    MaxAir: 42,
    HasCollision: 47,
    AffectedByGravity: 48,
    BoundingBoxWidth: 53,
    BoundingBoxHeight: 54
}
const FlagType = {
    Byte: 0,
    Short: 1,
    Int: 2,
    Float: 3,
    String: 4,
    Item: 5,
    Position: 6,
    Long: 7,
    Vector: 8
}
class Metadata {
    key
    type
    value

    constructor(key, type, value) {
        this.key = key
        this.type = type
        this.value = value
    }
}
class MetadataManager {
    properties = new Map()

    getPropertyValue(key, type) {
        return this.properties.has(key) ? this.properties.get(key)[1] : null
    }

    setPropertyValue(key, type, value) {
        this.properties.set(key, [type, value])
    }

    setLong(key, value) {
        this.setPropertyValue(key, FlagType.Long, value)
    }

    setShort(key, value) {
        this.setPropertyValue(key, FlagType.Short, value)
    }

    setString(key, value) {
        this.setPropertyValue(key, FlagType.String, value)
    }

    setFloat(key, value) {
        this.setPropertyValue(key, FlagType.Float, value)
    }
}
module.exports = { MetaFlags, FlagType, Metadata, MetadataManager }