import type BinaryStream from '@jsprismarine/jsbinaryutils';
import { NetworkUtil } from '../network/NetworkUtil';

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

    // flags
    SPRINTING = 3,
    HAS_COLLISION = 48,
    AFFECTED_BY_GRAVITY = 49,
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

export type MetadataContainer = Map<number, [number, bigint | number | boolean | string]>;
export class MetadataWriter {
    private readonly metadata: MetadataContainer = new Map();

    public getPropertyValue(key: number): bigint | number | boolean | string | null {
        return this.metadata.has(key) ? this.metadata.get(key)![1] : null;
    }

    public setPropertyValue(key: number, type: number, value: bigint | number | boolean | string): void {
        this.metadata.set(key, [type, value]);
    }

    public setLong(key: number, value: bigint): void {
        this.setPropertyValue(key, FlagType.LONG, value);
    }

    public setShort(key: number, value: number): void {
        this.setPropertyValue(key, FlagType.SHORT, value);
    }

    /**
     * Set the property value as a string.
     * @param {number} key - The property id.
     * @param {string} value - The property value.
     */
    public setString(key: number, value: string): void {
        this.setPropertyValue(key, FlagType.STRING, value);
    }
    /**
     * Get the property value as a string.
     * @param {number} key - The property id.
     * @returns {string} The property value.
     */
    public getString(key: number): string {
        return this.metadata.get(key)! as any;
    }

    /**
     * Set the property value as a float.
     * @param {number} key - The property id.
     * @param {number} value - The property value.
     */
    public setFloat(key: number, value: number): void {
        this.setPropertyValue(key, FlagType.FLOAT, value);
    }
    /**
     * Get the property value as a float.
     * @param {number} key - The property id.
     * @returns {number}
     */
    public getFloat(key: number): number {
        return this.metadata.get(key)! as any;
    }

    /**
     * Set a flag value.
     * @param {number} propertyId - The property id.
     * @param {number} flagId - The flag id.
     * @param {boolean} [value=true] - The flag value.
     * @param {FlagType} [propertyType=FlagType.LONG] - The property type.
     */
    public setDataFlag(propertyId: number, flagId: number, value = true, propertyType = FlagType.LONG): void {
        // All generic flags are written as Longs (bigints) 64bit
        const flagId64 = BigInt(flagId);
        // Check if the same value is already set
        if (this.getDataFlag(propertyId, flagId64) !== value) {
            const flags = this.getPropertyValue(propertyId) as bigint;
            this.setPropertyValue(propertyId, propertyType, flags ^ (1n << flagId64));
        }
    }
    /**
     * Get the property value as a boolean.
     * @param {number} propertyId - The property id.
     * @param {bigint} flagId - The flag id.
     * @returns {boolean} The flag value.
     */
    public getDataFlag(propertyId: number, flagId: bigint): boolean {
        return ((this.getPropertyValue(propertyId) as bigint) & (1n << flagId)) > 0;
    }

    /**
     * @param {number} flagId - The flag id.
     * @param {boolean} [value=true] - The flag value.
     */
    public setGenericFlag(flagId: number, value = true): void {
        this.setDataFlag(flagId >= 64 ? 94 : MetadataFlag.INDEX, flagId % 64, value, FlagType.LONG);
    }

    /**
     * Get the property value as a boolean.
     * @returns {typeof metadata} The metadata object.
     */
    public getData() {
        return this.metadata;
    }

    public networkSerialize(stream: BinaryStream): void {
        stream.writeUnsignedVarInt(this.getData().size);
        for (const [index, value] of this.getData()) {
            stream.writeUnsignedVarInt(index);
            stream.writeSignedByte(value[0]);
            switch (value[0]) {
                case FlagType.BYTE:
                    stream.writeByte(value[1] as number);
                    break;
                case FlagType.FLOAT:
                    stream.writeFloatLE(value[1] as number);
                    break;
                case FlagType.LONG:
                    stream.writeVarLong(value[1] as bigint);
                    break;
                case FlagType.STRING:
                    NetworkUtil.writeString(stream, value[1] as string);
                    break;
                case FlagType.SHORT:
                    stream.writeUnsignedShortLE(value[1] as number);
                    break;
                case FlagType.ITEM: // TODO: Implement this.
                    break;
                case FlagType.POSITION: // TODO: Implement this.
                    break;
                case FlagType.VECTOR: // TODO: Implement this.
                    break;
                default:
                    throw new Error(`Metadata type ${value[0]} not supported`);
            }
        }
    }
}

/**
 * Represents the metadata of an entity.
 */
export class Metadata extends MetadataWriter {
    /**
     * Create a new metadata object.
     * @param {boolean} [setDefaults=true]
     * @returns {Metadata} the metadata object.
     */
    constructor(setDefaults = true) {
        super();

        if (!setDefaults) return;
        this.setDefaults();
    }

    /**
     * Set the default metadata values.
     * @remarks This method is called when the metadata object is created.
     * @TODO: Add missing functions.
     */
    protected setDefaults(): void {
        this.setLong(MetadataFlag.INDEX, 0n);

        this.setShort(MetadataFlag.MAX_AIR, 300);
        this.setLong(MetadataFlag.ENTITY_LEAD_HOLDER_ID, -1n);
        this.setFloat(MetadataFlag.BOUNDINGBOX_WIDTH, 0.6);
        this.setFloat(MetadataFlag.BOUNDINGBOX_HEIGHT, 1.8);
        this.setShort(MetadataFlag.AIR, 0);

        this.setScale(1);

        this.setAffectedByGravity(true);
        this.setCollidable(true);
    }

    /**
     * Set the entity's name tag.
     * @param {string} name - The name tag.
     * @example
     * ```typescript
     * entity.setNameTag('Steve');
     * ```
     */
    public setNameTag(name: string): void {
        this.setString(MetadataFlag.NAMETAG, name);
    }
    /**
     * Get the entity's name tag.
     * @returns {string} The entity's name tag.
     * ```typescript
     * console.log(entity.nameTag); // Steve
     * ```
     */
    public get nameTag(): string {
        return this.getString(MetadataFlag.NAMETAG);
    }

    /**
     * Set the entity's scale.
     * @param {number} [scale=1] - The entity's scale.
     */
    public setScale(scale: number = 1): void {
        this.setFloat(MetadataFlag.SCALE, scale);
    }
    /**
     * Get the entity's scale.
     * @returns {number} The entity's scale.
     */
    public getScale(): number {
        return this.getPropertyValue(MetadataFlag.SCALE) as number;
    }

    /**
     * Set if the entity should be affected by gravity.
     * @param {boolean} [affected=true] - if the entity should be affected by gravity.
     */
    public setAffectedByGravity(affected: boolean = true): void {
        this.setGenericFlag(MetadataFlag.AFFECTED_BY_GRAVITY, affected);
    }
    /**
     * Get if the entity is affected by gravity.
     * @returns {boolean} if the entity is affected by gravity.
     * @TODO: Implement this method.
     */
    public get affectedByGravity(): boolean {
        throw new Error('TODO: Method not implemented.');
    }

    /**
     * Set if the entity should be collidable.
     * @param {boolean} [collidable=true] - if the entity should be collidable.
     */
    public setCollidable(collidable: boolean = true): void {
        this.setGenericFlag(MetadataFlag.HAS_COLLISION, collidable);
    }
    /**
     * Get if the entity is collidable.
     * @returns {boolean} if the entity is collidable.
     * @TODO: Implement this method.
     */
    public get collidable(): boolean {
        throw new Error('TODO: Method not implemented.');
    }
}
