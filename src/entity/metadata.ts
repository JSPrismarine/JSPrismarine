// TODO: Still missing flags
export enum MetadataFlag {
    INDEX,
    HEALTH,
    VARIANT,
    COLOR,
    NAMETAG,
    OWNER_ENTITY_ID,
    TARGET_ENTITY_ID,
    AIR,
    POTION_COLOR,
    AMBIENT,
    HURT_TIME,
    HURT_DIRECTION,
    PADDLE_TIME_LEFT,
    PADDLE_TIME_RIGHT,
    EXPERIENCE_VALUE,
    PLAYER_INDEX = 27,
    ENTITY_LEAD_HOLDER_ID = 37,
    SCALE,
    MAX_AIR = 42,
    HAS_COLLISION = 47,
    AFFECTED_BY_GRAVITY,
    BOUNDINGBOX_WIDTH = 53,
    BOUNDINGBOX_HEIGHT
}

export enum FlagType {
    BYTE,
    SHORT,
    INT,
    FLOAT,
    STRING,
    ITEM,
    POSITION,
    LONG,
    VECTOR
}

export default class MetadataManager {
    private metadata: Map<
        number,
        [number, bigint | number | boolean | string]
    > = new Map();

    public getPropertyValue(
        key: number
    ): bigint | number | boolean | string | null {
        return this.metadata.has(key) ? this.metadata.get(key)![1] : null;
    }

    public setPropertyValue(
        key: number,
        type: number,
        value: bigint | number | boolean | string
    ) {
        this.metadata.set(key, [type, value]);
    }

    public setLong(key: number, value: bigint) {
        this.setPropertyValue(key, FlagType.LONG, value);
    }

    public setShort(key: number, value: number) {
        this.setPropertyValue(key, FlagType.SHORT, value);
    }

    public setString(key: number, value: string) {
        this.setPropertyValue(key, FlagType.STRING, value);
    }

    public setFloat(key: number, value: number) {
        this.setPropertyValue(key, FlagType.FLOAT, value);
    }

    public getMetadata() {
        return this.metadata;
    }
}
