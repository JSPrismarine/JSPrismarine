import type { Vector3 } from '@jsprismarine/math';
import type BinaryStream from '@jsprismarine/binaryutils';
import type { NBTTagCompound } from '@jsprismarine/nbt';
import { NetworkUtil } from '../network/NetworkUtil';

/**
 * The data item ids and flag bits this server sets, in the protocol 2193 numbering.
 *
 * Two different enumerations live here. Everything down to `BOUNDINGBOX_HEIGHT` is an
 * `ActorDataID`, the key of a `DataItemEntry`; everything after it is an `ActorFlags` bit
 * inside the long stored at `INDEX`. `@jsprismarine/minecraft` generates both from the
 * published docs under those names, and the entries here are the handful the server uses,
 * under the names the rest of this package already calls them by. Four of them the docs name
 * differently: `INDEX` is `Flags`, `HEALTH` is `StructuralIntegrity`, `EXPERIENCE_VALUE` is
 * `Value`, and the bounding box pair is `Width` and `Height`.
 *
 * The run from `HURT_TIME` to `EXPERIENCE_VALUE` used to be numbered one lower apiece,
 * because id 10 (`JumpDuration`, which nothing here sets) was missing from the list. A player
 * respawning cleared `JumpDuration` and `Hurt` rather than `Hurt` and `HurtDirection`, so the
 * red flash stayed on the fresh body.
 */
export enum MetadataFlag {
    INDEX = 0,
    HEALTH = 1,
    VARIANT = 2,
    COLOR = 3,
    NAMETAG = 4,
    OWNER_ENTITY_ID = 5,
    TARGET_ENTITY_ID = 6,
    AIR = 7,
    POTION_COLOR = 8,
    AMBIENT = 9,
    HURT_TIME = 11,
    HURT_DIRECTION = 12,
    PADDLE_TIME_LEFT = 13,
    PADDLE_TIME_RIGHT = 14,
    EXPERIENCE_VALUE = 15,
    PLAYER_INDEX = 27,
    ENTITY_LEAD_HOLDER_ID = 37,
    SCALE = 38,
    MAX_AIR = 42,
    BOUNDINGBOX_WIDTH = 53,
    BOUNDINGBOX_HEIGHT = 54,

    // Flag bits inside the long stored at INDEX, not ids of their own.
    ONFIRE = 0,
    SPRINTING = 3,
    /** Holding an item down: drawing a bow, raising a shield, eating. Drives the client's pose. */
    USINGITEM = 4,
    /** Winding an attack up. What a skeleton pulling a bow sets, alongside {@link USINGITEM}. */
    CHARGING = 43,
    /** A creeper mid-swell. The client draws the bulge and the flash off this. */
    IGNITED = 10,
    CAN_CLIMB = 19,
    CAN_FLY = 21,
    BREATHING = 35,
    HAS_COLLISION = 48,
    AFFECTED_BY_GRAVITY = 49
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

/**
 * How long an entity can stay underwater, in ticks - fifteen seconds, as in vanilla.
 */
export const MAX_AIR_TICKS = 300;

/**
 * The data item id holding flag bits 64 and above, `FlagsTwo` in the docs' `ActorDataID`.
 *
 * Not a member of {@link MetadataFlag}, because nothing names a flag that high yet and an id
 * sitting among the flag bits is what made it 94 - `LayingAmountPrevious` - for a while.
 */
const FLAGS_TWO = 92;

/**
 * One stored metadata property: the wire type it is sent as, paired with the value that type carries.
 *
 * Each `FlagType` pairs with exactly one value type, so a `switch` on the first element narrows the
 * second. `ITEM` is listed so that an entry of that type can be stored; `networkSerialize` has no
 * writer for it yet.
 */
export type MetadataEntry =
    | [FlagType.BYTE, number]
    | [FlagType.SHORT, number]
    | [FlagType.INT, number]
    | [FlagType.FLOAT, number]
    | [FlagType.STRING, string]
    | [FlagType.ITEM, NBTTagCompound]
    | [FlagType.POSITION, Vector3]
    | [FlagType.LONG, bigint]
    | [FlagType.VECTOR, Vector3];

/** Any value a metadata property can hold. */
export type MetadataValue = MetadataEntry[1];

/** Metadata properties by id. */
export type MetadataContainer = Map<number, MetadataEntry>;

export class MetadataWriter {
    private readonly metadata: MetadataContainer = new Map();

    public getPropertyValue(key: number): MetadataValue | null {
        return this.metadata.get(key)?.[1] ?? null;
    }

    public setPropertyValue(key: number, ...entry: MetadataEntry): void {
        this.metadata.set(key, entry);
    }

    /** The property's value when it holds a string, otherwise `fallback`. */
    protected stringAt(key: number, fallback: string): string {
        const value = this.getPropertyValue(key);
        return typeof value === 'string' ? value : fallback;
    }

    /** The property's value when it holds a number, otherwise `fallback`. */
    protected numberAt(key: number, fallback: number): number {
        const value = this.getPropertyValue(key);
        return typeof value === 'number' ? value : fallback;
    }

    /** The property's value when it holds a long, otherwise `0n`. */
    protected longAt(key: number): bigint {
        const value = this.getPropertyValue(key);
        return typeof value === 'bigint' ? value : 0n;
    }

    public setLong(key: number, value: bigint): void {
        this.setPropertyValue(key, FlagType.LONG, value);
    }

    public setShort(key: number, value: number): void {
        this.setPropertyValue(key, FlagType.SHORT, value);
    }

    /**
     * Set the property value as an int.
     * @param {number} key - The property id.
     * @param {number} value - The property value.
     * @remarks Block runtime ids are why this exists: a falling block tells the client which block
     * it is through `VARIANT`, and that is an int - a short would truncate the hash to nonsense.
     */
    public setInt(key: number, value: number): void {
        this.setPropertyValue(key, FlagType.INT, value);
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
        // The map holds [type, value] pairs, so the value has to be picked out of the
        // pair. Returning the pair produced a name that stringified as "4,HerryYT" - the
        // 4 being FlagType.STRING - everywhere a name reached a template literal.
        return this.stringAt(key, '');
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
        return this.numberAt(key, 0);
    }

    /**
     * Set a flag value.
     * @param {number} propertyId - The property id.
     * @param {number} flagId - The flag id.
     * @param {boolean} [value=true] - The flag value.
     * @param {FlagType.LONG} [propertyType=FlagType.LONG] - The property type. Only `LONG` is
     * accepted: the flags are one 64-bit field, and any other type truncates it on the wire.
     */
    public setDataFlag(
        propertyId: number,
        flagId: number,
        value = true,
        propertyType: FlagType.LONG = FlagType.LONG
    ): void {
        // All generic flags are written as Longs (bigints) 64bit
        const flagId64 = BigInt(flagId);
        // Check if the same value is already set
        if (this.getDataFlag(propertyId, flagId64) !== value) {
            this.setPropertyValue(propertyId, propertyType, this.longAt(propertyId) ^ (1n << flagId64));
        }
    }
    /**
     * Get the property value as a boolean.
     * @param {number} propertyId - The property id.
     * @param {bigint} flagId - The flag id.
     * @returns {boolean} The flag value.
     */
    public getDataFlag(propertyId: number, flagId: bigint): boolean {
        return (this.longAt(propertyId) & (1n << flagId)) > 0n;
    }

    /**
     * Set one of the entity's generic flags.
     *
     * Always as a Long: the flags are a single 64-bit field, and the type sent with it says
     * how many bytes follow it. Sprinting, flying and climbing used to declare theirs a
     * `BYTE`, so the client read one byte of a 64-bit number and then carried on reading the
     * rest of it as further properties - which is why setting any of them lost collision and
     * gravity along the way.
     * @param {number} flagId - The flag id.
     * @param {boolean} [value=true] - The flag value.
     */
    public setGenericFlag(flagId: number, value = true): void {
        this.setDataFlag(flagId >= 64 ? FLAGS_TWO : MetadataFlag.INDEX, flagId % 64, value, FlagType.LONG);
    }

    /**
     * Get the property value as a boolean.
     * @returns {typeof metadata} The metadata object.
     */
    public getData() {
        return this.metadata;
    }

    /**
     * Writes the properties as a `SynchedActorDataList`.
     *
     * A varuint32 count, then one `DataItemEntry` per property: the `ID` as a varuint32, the
     * payload's `Type` as a varuint32 selector, the same type again as the alternative's own
     * uint8 first field, and the value.
     *
     * The entries go out in ascending id order rather than in the order they were set. The
     * client reads some properties as a group and expects them to arrive in order - an NPC
     * shows neither its text nor its buttons when they do not - and ascending is also what a
     * Bedrock Dedicated Server writes, since it walks its own map.
     * @param stream - The network stream.
     */
    public networkSerialize(stream: BinaryStream): void {
        const entries = Array.from(this.getData()).sort(([left], [right]) => left - right);

        stream.writeUnsignedVarInt(entries.length);
        for (const [index, value] of entries) {
            stream.writeUnsignedVarInt(index);

            // The type twice. An entry is now a tagged variant - a varint selector, then the
            // alternative it selected - and the alternative's own first field is the same
            // type as a byte. Writing only the byte, as 748 did, leaves the client reading
            // the value as the type and every entry after it from the wrong place.
            stream.writeUnsignedVarInt(value[0]);
            stream.writeSignedByte(value[0]);
            switch (value[0]) {
                case FlagType.BYTE:
                    stream.writeByte(value[1]);
                    break;
                case FlagType.FLOAT:
                    stream.writeFloatLE(value[1]);
                    break;
                case FlagType.LONG:
                    stream.writeVarLong(value[1]);
                    break;
                case FlagType.STRING:
                    NetworkUtil.writeString(stream, value[1]);
                    break;
                case FlagType.SHORT:
                    // Signed: `DataItemShortPayload` carries an int16, and the unsigned writer
                    // this used throws rather than wrapping when a property goes negative.
                    stream.writeShortLE(value[1]);
                    break;
                case FlagType.INT:
                    // A varint, not four bytes. Missing entirely, and it is what a falling
                    // block carries its own block state in - so every sand or gravel that
                    // started to fall threw here instead of appearing, and went on throwing
                    // for every player who came near it.
                    stream.writeVarInt(value[1]);
                    break;
                case FlagType.VECTOR: {
                    const vector = value[1];
                    stream.writeFloatLE(vector.getX());
                    stream.writeFloatLE(vector.getY());
                    stream.writeFloatLE(vector.getZ());
                    break;
                }
                case FlagType.POSITION: {
                    // Three signed varints. Unlike a block position elsewhere in the protocol,
                    // this one's height is signed like the other two.
                    const position = value[1];
                    stream.writeVarInt(position.getX());
                    stream.writeVarInt(position.getY());
                    stream.writeVarInt(position.getZ());
                    break;
                }
                default:
                    // `ITEM` is the remaining one, and it carries an NBT compound this has no
                    // writer for. Named rather than numbered, because a number here cost an
                    // afternoon.
                    throw new Error(
                        `Metadata type ${FlagType[value[0]] ?? value[0]} (${value[0]}) cannot be written yet`
                    );
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
     *
     * Only the properties every entity needs on screen. Everything else in `ActorDataID` is
     * left unset, which is the same as a vanilla default, and the entity classes add what
     * their own kind needs.
     * @remarks This method is called when the metadata object is created.
     */
    protected setDefaults(): void {
        this.setLong(MetadataFlag.INDEX, 0n);

        this.setLong(MetadataFlag.ENTITY_LEAD_HOLDER_ID, -1n);

        // A block, which is Mojang's own default for an entity that has not said - and the
        // conservative one. `Entity` overwrites this with the real size from `EntitySize` as soon
        // as it is built; only metadata belonging to nothing in particular keeps it. It used to be
        // a player's 0.6 x 1.8, which is not a default so much as a wrong answer wearing one:
        // every chicken and every ghast announced itself as a person.
        this.setBoundingBox(1, 1);

        // Both, and in this order: `AIR` is breath left, not breath used. It was sent as 0,
        // which is what an entity that has been underwater for fifteen seconds looks like -
        // hence the bubble bar draining the moment a player spawned on dry land.
        this.setShort(MetadataFlag.MAX_AIR, MAX_AIR_TICKS);
        this.setShort(MetadataFlag.AIR, MAX_AIR_TICKS);

        // And the flag that decides whether the bar is drawn at all. Full lungs are not
        // enough on their own: the client shows the bubbles for anything not breathing, so
        // an entity that never set this drowns on screen while standing in a field.
        this.setBreathing();

        this.setScale();
        this.setAffectedByGravity();
        this.setCollidable();
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
     */
    public get nameTag(): string {
        return this.getString(MetadataFlag.NAMETAG);
    }

    /**
     * Set how much breath the entity has left, in ticks.
     * @param {number} [air=MAX_AIR_TICKS] - Ticks of breath remaining, clamped to the maximum.
     */
    public setAir(air: number = MAX_AIR_TICKS): void {
        this.setShort(MetadataFlag.AIR, Math.max(0, Math.min(air, this.maxAir)));
    }
    /**
     * Get how much breath the entity has left, in ticks.
     * @returns {number} Ticks of breath remaining.
     */
    public get air(): number {
        return this.numberAt(MetadataFlag.AIR, 0);
    }

    /**
     * Set whether the entity is breathing. False is what draws the bubble bar.
     * @param {boolean} [breathing=true] - Whether the entity has air to breathe.
     */
    public setBreathing(breathing: boolean = true): void {
        this.setGenericFlag(MetadataFlag.BREATHING, breathing);
    }
    /**
     * Get whether the entity is breathing.
     * @returns {boolean} `true` if the entity is breathing.
     */
    public get breathing(): boolean {
        return this.getDataFlag(MetadataFlag.INDEX, BigInt(MetadataFlag.BREATHING));
    }

    /**
     * Set how long the entity can stay underwater, in ticks.
     * @param {number} [maxAir=MAX_AIR_TICKS] - The maximum breath, in ticks.
     */
    public setMaxAir(maxAir: number = MAX_AIR_TICKS): void {
        this.setShort(MetadataFlag.MAX_AIR, maxAir);
    }
    /**
     * Get how long the entity can stay underwater, in ticks.
     * @returns {number} The maximum breath, in ticks.
     */
    public get maxAir(): number {
        return this.numberAt(MetadataFlag.MAX_AIR, MAX_AIR_TICKS);
    }

    /**
     * Set the entity's scale.
     * @param {number} [scale=1] - The entity's scale.
     */
    public setScale(scale: number = 1): void {
        this.setFloat(MetadataFlag.SCALE, scale);
    }

    /**
     * Set the box the client draws and aims at.
     *
     * This is the size the *client* uses - for the hitbox it highlights, for where an attack
     * lands, and for how far the entity is drawn from a wall. It has to be the same box the
     * server collides against or the two disagree visibly: everything used to be announced as
     * `0.6 x 1.8`, a player, whatever it actually was.
     * @param {number} width - Blocks across, on both horizontal axes.
     * @param {number} height - Blocks tall, measured up from the feet.
     */
    public setBoundingBox(width: number, height: number): void {
        this.setFloat(MetadataFlag.BOUNDINGBOX_WIDTH, width);
        this.setFloat(MetadataFlag.BOUNDINGBOX_HEIGHT, height);
    }
    /**
     * Get the entity's scale.
     * @returns {number} The entity's scale, or `1` when none has been set.
     */
    public getScale(): number {
        return this.numberAt(MetadataFlag.SCALE, 1);
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
     */
    public get affectedByGravity(): boolean {
        return this.getDataFlag(MetadataFlag.INDEX, BigInt(MetadataFlag.AFFECTED_BY_GRAVITY));
    }

    /**
     * Set if the entity should be collidable.
     * @param {boolean} [collidable=true] - if the entity should be collidable.
     */
    public setCollidable(collidable: boolean = true): void {
        this.setGenericFlag(MetadataFlag.HAS_COLLISION, collidable);
    }
    /**
     * Get entity's collidable state.
     * @returns {boolean} if the entity is collidable.
     */
    public get collidable(): boolean {
        return this.getDataFlag(MetadataFlag.INDEX, BigInt(MetadataFlag.HAS_COLLISION));
    }

    /**
     * Set whether the entity is visibly alight.
     *
     * Only the flames the client draws. Whether the burn actually hurts is the server's business
     * and is tracked separately - a creative player is set alight and takes nothing for it.
     * @param {boolean} [onFire=true] - if the entity is burning.
     */
    public setOnFire(onFire: boolean = true): void {
        this.setGenericFlag(MetadataFlag.ONFIRE, onFire);
    }

    /**
     * Get whether the entity is visibly alight.
     * @returns {boolean} if the entity is burning.
     */
    public get onFire(): boolean {
        return this.getDataFlag(MetadataFlag.INDEX, BigInt(MetadataFlag.ONFIRE));
    }

    /**
     * Set what the entity is currently attacking, by runtime id.
     *
     * Far more than bookkeeping: this is what drives a mob's whole combat pose on the client.
     * Mojang's own skeleton animation controller transitions into its attack state on
     * `query.has_target && !query.facing_target_to_range_attack` - it never looks at
     * `is_using_item` at all - so a skeleton whose target the client does not know about stands
     * with its bow at its side however faithfully the server sets every other flag.
     * @param {bigint} runtimeId - What it is attacking, or `0n` for nothing.
     * @see https://github.com/Mojang/bedrock-samples/blob/main/resource_pack/animation_controllers/skeleton.animation_controllers.json
     */
    public setTargetEntityId(runtimeId: bigint): void {
        this.setLong(MetadataFlag.TARGET_ENTITY_ID, runtimeId);
    }

    /** What the entity is attacking, or `0n`. */
    public get targetEntityId(): bigint {
        return this.longAt(MetadataFlag.TARGET_ENTITY_ID);
    }

    /**
     * Set whether the entity is holding its item down.
     *
     * The client's whole bow-drawing pose comes from this flag and nothing else: a skeleton that
     * fires without it appears to shoot arrows from a lowered bow, which is what makes the attack
     * read as a bug rather than as an attack.
     * @param {boolean} [usingItem=true] - if the item is being drawn or held.
     */
    public setUsingItem(usingItem: boolean = true): void {
        this.setGenericFlag(MetadataFlag.USINGITEM, usingItem);

        // Both, because the client's animation controllers do not agree on which one to read: a
        // player's pose comes off `USINGITEM` and a mob's bow pull off `CHARGING`. Setting one and
        // not the other leaves the skeleton holding its bow at its side while it shoots.
        this.setGenericFlag(MetadataFlag.CHARGING, usingItem);
    }

    /**
     * Set whether a creeper is swelling.
     *
     * The bulge and the flash are the client's own animation, driven entirely by this flag - so a
     * creeper whose fuse is lit only server-side stands there looking ordinary and then kills you
     * with no warning at all.
     * @param {boolean} [ignited=true] - if the fuse is lit.
     */
    public setIgnited(ignited: boolean = true): void {
        this.setGenericFlag(MetadataFlag.IGNITED, ignited);
    }

    /**
     * Set the entity's sprinting state.
     * @param {boolean} [sprinting=true] - if the entity is sprinting.
     */
    public setSprinting(sprinting: boolean = true): void {
        this.setGenericFlag(MetadataFlag.SPRINTING, sprinting);
    }
    /**
     * Get entity's sprinting state.
     * @returns {boolean} if the entity is sprinting.
     */
    public get sprinting(): boolean {
        return this.getDataFlag(MetadataFlag.INDEX, BigInt(MetadataFlag.SPRINTING));
    }

    /**
     * Set the entity's can fly state.
     * @param {boolean} [canFly=true] - if the entity can fly.
     */
    public setCanFly(canFly: boolean = true): void {
        this.setGenericFlag(MetadataFlag.CAN_FLY, canFly);
    }
    /**
     * Get entity's can fly state.
     * @returns {boolean} if the entity can fly.
     */
    public get canFly(): boolean {
        return this.getDataFlag(MetadataFlag.INDEX, BigInt(MetadataFlag.CAN_FLY));
    }

    /**
     * Set the entity's can climb state.
     * @param {boolean} [canClimb=true] - if the entity can climb.
     */
    public setCanClimb(canClimb: boolean = true): void {
        this.setGenericFlag(MetadataFlag.CAN_CLIMB, canClimb);
    }
    /**
     * Get entity's can climb state.
     * @returns {boolean} if the entity can climb.
     */
    public get canClimb(): boolean {
        return this.getDataFlag(MetadataFlag.INDEX, BigInt(MetadataFlag.CAN_CLIMB));
    }
}
