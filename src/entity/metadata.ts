// TODO: Still missing flags
export const MetadataFlag = {
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
};

export const FlagType = {
    Byte: 0,
    Short: 1,
    Int: 2,
    Float: 3,
    String: 4,
    Item: 5,
    Position: 6,
    Long: 7,
    Vector: 8
};

export class MetadataManager {
    /** @type {Map<number, []>} */
    #metadata = new Map()

    getPropertyValue(key: string) {
        return this.#metadata.has(key) ? this.#metadata.get(key)[1] : null;
    }

    setPropertyValue(key: string, type: any, value: any) {
        this.#metadata.set(key, [type, value]);
    }

    setLong(key: string, value: any) {
        this.setPropertyValue(key, FlagType.Long, value);
    }

    setShort(key: string, value: any) {
        this.setPropertyValue(key, FlagType.Short, value);
    }

    setString(key: string, value: any) {
        this.setPropertyValue(key, FlagType.String, value);
    }

    setFloat(key: string, value: any) {
        this.setPropertyValue(key, FlagType.Float, value);
    }

    getMetadata() {
        return this.#metadata;
    }

}
