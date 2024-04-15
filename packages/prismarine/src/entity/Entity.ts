import type Player from '../Player';
import type Server from '../Server';
import Vector3 from '../math/Vector3';
import AddActorPacket from '../network/packet/AddActorPacket';
import MoveActorAbsolutePacket from '../network/packet/MoveActorAbsolutePacket';
import RemoveActorPacket from '../network/packet/RemoveActorPacket';
import TextType from '../network/type/TextType';
import UUID from '../utils/UUID';
import Position from '../world/Position';
import AttributeManager from './Attribute';
import MetadataManager, { FlagType, MetadataFlag } from './Metadata';

/**
 * Entity-like class.
 */
export class EntityLike extends Position {
    protected readonly uuid: string;
    protected readonly runtimeId: bigint;
    protected readonly server: Server;

    /**
     * EntityLike constructor.
     * @constructor
     * @param {object} options - The entity-like options.
     * @param {string} options.uuid - The entity's runtime id.
     * @param {bigint} options.runtimeId - The entity's runtime id.
     * @param {Server} options.server - The server instance.
     * @param {World} [options.world] - The world the entity belongs to.
     * @returns {EntityLike} The entity-like instance.
     */
    public constructor({
        uuid,
        runtimeId,
        ...options
    }: ConstructorParameters<typeof Position>[0] & {
        uuid?: string;
        runtimeId: bigint;
    }) {
        super(options); // TODO
        this.server = options.server;
        this.uuid = uuid ?? UUID.randomString();
        this.runtimeId = runtimeId;
    }

    /**
     * Get the entity's runtime id.
     * @returns {bigint} The entity's runtime id.
     */
    public getRuntimeId(): bigint {
        return this.runtimeId;
    }

    /**
     * Get the server instance.
     * @returns {Server} The server instance.
     */
    public getServer(): Server {
        return this.server;
    }

    /**
     * Get the entity's position.
     * @returns {Vector3} The entity's position.
     * @example
     * ```typescript
     * const position = entity.getPosition();
     * ```
     */
    public getPosition(): Vector3 {
        return new Vector3(this.getX(), this.getY(), this.getZ());
    }

    /**
     * Returns the nearest entity from the current entity.
     * @todo Customizable radius
     * @param {Entity[]} [entities=this.getWorld().getEntities()] - The entities to compare the distance between.
     * @returns {Entity[]} The nearest entity.
     * @example
     * ```typescript
     * const nearestEntity = entity.getNearestEntity();
     * console.log('Nearest entity:', nearestEntity);
     * ```
     */
    public getNearestEntity(entities: Entity[] = this.getWorld().getEntities()): Entity[] {
        const position = new Vector3(this.getX(), this.getY(), this.getZ());
        const distance = (a: Vector3, b: Vector3) =>
            Math.hypot(b.getX() - a.getX(), b.getY() - a.getY(), b.getZ() - a.getZ());

        const closest = (target: Vector3, points: Entity[], eps = 0.00001) => {
            const distances = points.map((e) => distance(target, new Vector3(e.getX(), e.getY(), e.getZ())));
            const closest = Math.min(...distances);
            return points.find((_e, i) => distances[i]! - closest < eps)!;
        };

        return [
            closest(
                position,
                entities.filter((entity) => entity.getRuntimeId() !== this.runtimeId)
            )
        ];
    }

    /**
     * Get entities within a radius of the current entity.
     * @param {number} radius - The radius.
     * @returns {Promise<Entity[]>} A promise that resolves with the entities within the specified radius.
     * @example
     * ```typescript
     * const nearbyEntities = await entity.getNearbyEntities(10);
     * console.log('Nearby entities:', nearbyEntities);
     * ```
     */
    public async getNearbyEntities(radius: number): Promise<Entity[]> {
        const entities = this.getWorld().getEntities();
        const position = this.getPosition();

        const min = new Vector3(position.getX() - radius, position.getY() - radius, position.getZ() - radius);
        const max = new Vector3(position.getX() + radius, position.getY() + radius, position.getZ() + radius);

        const res = entities.filter((entity) => {
            if (entity.getRuntimeId() === this.runtimeId) return false;

            const position = entity.getPosition();

            if (
                min.getX() < position.getX() &&
                max.getX() > position.getX() &&
                min.getY() < position.getY() &&
                max.getY() > position.getY() &&
                min.getZ() < position.getZ() &&
                max.getZ() > position.getZ()
            )
                return true;

            return false;
        });

        // TODO: sort entities based on distance
        return res;
    }
}

/**
 * The base class for all entities including `Player`.
 */
export class Entity extends EntityLike {
    /**
     * The entity's namespace ID.
     */
    protected static MOB_ID: string;

    /**
     * The global runtime id counter.
     */
    public static runtimeIdCount = 0n;

    /**
     * @deprecated
     */
    private readonly metadata: MetadataManager = new MetadataManager();

    /**
     * @deprecated
     */
    private readonly attributes: AttributeManager = new AttributeManager();

    /**
     * Entity constructor.
     * @constructor
     * @param {object} options - The entity options.
     * @param {World} options.world - The world the entity belongs to.
     * @param {Server} options.server - The server instance.
     * @param {string} [options.uuid] - The entity's UUID.
     * @returns {Entity} The entity instance.
     * @example
     * ```typescript
     * const entity = new Entity({
     *     world: server.getWorldManager().getDefaultWorld(),
     *     server
     * });
     * ```
     */
    public constructor({ ...options }: Omit<ConstructorParameters<typeof EntityLike>[0], 'runtimeId'>) {
        Entity.runtimeIdCount += 1n;
        super({
            ...options,
            runtimeId: Entity.runtimeIdCount
        });

        this.metadata.setLong(MetadataFlag.INDEX, 0n);
        this.metadata.setShort(MetadataFlag.MAX_AIR, 300);
        this.metadata.setLong(MetadataFlag.ENTITY_LEAD_HOLDER_ID, -1n);
        this.metadata.setFloat(MetadataFlag.SCALE, 1);
        this.metadata.setFloat(MetadataFlag.BOUNDINGBOX_WIDTH, 0.6);
        this.metadata.setFloat(MetadataFlag.BOUNDINGBOX_HEIGHT, 1.8);
        this.metadata.setShort(MetadataFlag.AIR, 0);

        this.setGenericFlag(MetadataFlag.AFFECTED_BY_GRAVITY, true);
        this.setGenericFlag(MetadataFlag.HAS_COLLISION, true);
    }

    get [Symbol.toStringTag]() {
        return `Entity(${this.toString()})`;
    }

    toString() {
        return `uuid: §a${this.getUUID()}§r, id: §a${this.getRuntimeId()}§r, name: §b${this.getName()}§r, type: §b${this.getType()}§r, ${super.toString.bind(this)()}`;
    }

    /**
     * Get the entity's runtime id.
     * @returns {bigint} The entity's runtime id.
     * @example
     * ```typescript
     * const entityId = entity.getRuntimeId();
     * console.log(entityId); // Ex. Output: 1n
     * ```
     */
    public getRuntimeId(): bigint {
        return this.runtimeId;
    }

    /**
     * Get the entity's UUID.
     * @returns {string} The entity's UUID.
     */
    public getUUID(): string {
        return this.uuid;
    }

    /**
     * Fired every tick from the event subscription in the constructor.
     * @param {number} tick - The current tick.
     * @returns {Promise<void>} A promise that resolves when the update is complete.
     * @example
     * ```typescript
     * entity.update(10);
     * ```
     */
    // eslint-disable-next-line unused-imports/no-unused-vars
    public async update(tick: number): Promise<void> {}

    /**
     * Get the server instance.
     * @returns {Server} The server instance.
     * @example
     * ```typescript
     * const server = entity.getServer();
     * ```
     */
    public getServer(): Server {
        return this.server;
    }

    /**
     * Set the entity's name tag.
     * @param {string} name - The name tag.
     */
    public setNameTag(name: string): void {
        this.metadata.setString(MetadataFlag.NAMETAG, name);
    }

    /**
     * @deprecated
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
            const flags = this.metadata.getPropertyValue(propertyId) as bigint;
            this.metadata.setPropertyValue(propertyId, propertyType, flags ^ (1n << flagId64));
        }
    }

    /**
     * @deprecated
     * @param {number} propertyId - The property id.
     * @param {bigint} flagId - The flag id.
     * @returns {boolean} The flag value.
     */
    public getDataFlag(propertyId: number, flagId: bigint): boolean {
        return ((this.metadata.getPropertyValue(propertyId) as bigint) & (1n << flagId)) > 0;
    }

    /**
     * @deprecated
     * @param {number} flagId - The flag id.
     * @param {boolean} [value=true] - The flag value.
     */
    public setGenericFlag(flagId: number, value = true): void {
        this.setDataFlag(flagId >= 64 ? 94 : MetadataFlag.INDEX, flagId % 64, value, FlagType.LONG);
    }

    /**
     * @deprecated
     * @returns {AttributeManager} The attribute manager.
     */
    public getAttributeManager(): AttributeManager {
        return this.attributes;
    }

    /**
     * @deprecated
     * @returns {MetadataManager} The metadata manager.
     */
    public getMetadataManager(): MetadataManager {
        return this.metadata;
    }

    /**
     * Spawn the entity.
     * @todo `motion`, `pitch` & `yaw` is unimplemented.
     * @param {Player} [player] - The player to send the packet to.
     * @returns {Promise<void>} A promise that resolves when the entity is spawned.
     */
    public async sendSpawn(player?: Player): Promise<void> {
        const players: Player[] = player
            ? [player]
            : (this.getWorld()
                  .getEntities()
                  .filter((entity) => entity.isPlayer()) as Player[]);

        const packet = new AddActorPacket();
        packet.runtimeEntityId = this.getRuntimeId();
        packet.type = (this.constructor as any).MOB_ID; // TODO
        packet.position = this;
        // TODO: motion
        packet.motion = new Vector3(0, 0, 0);
        packet.pitch = 0;
        packet.yaw = 0;
        packet.headYaw = 0;
        packet.metadata = this.metadata.getMetadata();
        await Promise.all(players.map(async (p) => p.getNetworkSession().getConnection().sendDataPacket(packet)));
    }

    /**
     * Despawn the entity.
     * @param {Player} [player] - The player to send the packet to.
     * @returns {Promise<void>} A promise that resolves when the entity is despawned.
     */
    public async sendDespawn(player?: Player): Promise<void> {
        const players: Player[] = player
            ? [player]
            : (this.getWorld()
                  .getEntities()
                  .filter((entity) => entity.isPlayer()) as Player[]);

        const packet = new RemoveActorPacket();
        packet.uniqueEntityId = this.runtimeId;
        await Promise.all(players.map(async (p) => p.getNetworkSession().getConnection().sendDataPacket(packet)));
    }

    /**
     * Send the position to all the players in the same world.
     * @returns {Promise<void>} A promise that resolves when the position is sent.
     */
    public async sendPosition(): Promise<void> {
        await Promise.all(
            this.getServer()
                .getSessionManager()
                .getAllPlayers()
                .filter((player) => player.getWorld().getUUID() === this.getWorld().getUUID())
                .map(async (player) => {
                    const packet = new MoveActorAbsolutePacket();
                    packet.runtimeEntityId = this.runtimeId;
                    packet.position = this.getPosition();

                    // TODO
                    packet.rotationX = 0;
                    packet.rotationY = 0;
                    packet.rotationZ = 0;
                    await player.getNetworkSession().getConnection().sendDataPacket(packet);
                })
        );
    }

    /**
     * Send a message to an entity.
     * @remarks This will silently fail on non-client-controlled entities.
     * @param {string} message - The message.
     * @param {TextType} [type=TextType.Raw] - The text type.
     * @example Send "Hello World!" to a client:
     * ```typescript
     * entity.sendMessage('Hello World!');
     * ```
     */
    public sendMessage(message: string, type: TextType = TextType.Raw): void {
        this.server
            .getLogger()
            .warn(`Entity/sendMessage is not implemented: (message: ${message}, type: ${type})`, 'Entity/sendMessage');
    }

    /**
     * Set the x position.
     * @param {number} x - The x coordinate.
     * @param {boolean} [suppress=false] - If true, the client won't be notified about the position change.
     * @returns {Promise<void>} A promise that resolves when the x position is set.
     * @example
     * ```typescript
     * await entity.setX(10);
     * ```
     * @remarks This method will also send the position update to the client if `suppress` is `false`.
     */
    public async setX(x: number, suppress = false): Promise<void> {
        super.setX.bind(this)(x);
        if (suppress && !this.isPlayer()) await this.sendPosition();
    }

    /**
     * Set the y position.
     * @param {number} y - The y coordinate.
     * @param {boolean} [suppress=false] - If true, the client won't be notified about the position change.
     * @returns {Promise<void>} A promise that resolves when the y position is set.
     * @example
     * ```typescript
     * await entity.setY(10);
     * ```
     * @remarks This method will also send the position update to the client if `suppress` is `false`.
     */
    public async setY(y: number, suppress = false): Promise<void> {
        super.setY.bind(this)(y);
        if (suppress && !this.isPlayer()) await this.sendPosition();
    }

    /**
     * Set the z position.
     * @param {number} z - The z coordinate.
     * @param {boolean} [suppress=false] - If true, the client won't be notified about the position change.
     * @returns {Promise<void>} A promise that resolves when the z position is set.
     * @example
     * ```typescript
     * await entity.setZ(10);
     * ```
     * @remarks This method will also send the position update to the client if `suppress` is `false`.
     */
    public async setZ(z: number, suppress = false): Promise<void> {
        super.setZ.bind(this)(z);
        if (suppress && !this.isPlayer()) await this.sendPosition();
    }

    /**
     * Set the entity's position and notify the clients.
     * @param {Vector3} position - The position.
     * @returns {Promise<void>} A promise that resolves when the position is set.
     */
    public async setPosition(position: Vector3): Promise<void> {
        await super.setX.bind(this)(position.getX());
        await super.setY.bind(this)(position.getY());
        await super.setZ.bind(this)(position.getZ());

        await this.sendPosition();
    }

    /**
     * Check if the entity is a player.
     * @returns {boolean} `true` if the entity is player-controlled, otherwise `false`.
     * @example
     * ```typescript
     * if (entity.isPlayer()) {
     *     console.log('Entity is a player');
     * } else {
     *     console.log('Entity is not a player');
     * }
     * ```
     */
    public isPlayer(): boolean {
        return false;
    }

    /**
     * Check if the entity is a console instance.
     * @returns {boolean} `true` if the entity is console-controlled, otherwise `false`.
     * @example
     * ```typescript
     * if (entity.isConsole()) {
     *     console.log('Entity is a console');
     * } else {
     *     console.log('Entity is not a console');
     * }
     * ```
     */
    public isConsole(): boolean {
        return this.getRuntimeId() <= 0n;
    }

    /**
     * Get the entity type.
     * @returns {string} The entity's namespace ID.
     * @example
     * ```typescript
     * const entityType = entity.getType();
     * console.log(`Entity type: ${entityType}`);
     * ```
     */
    public getType(): string {
        return (this.constructor as any).MOB_ID;
    }

    /**
     * Get the entity's (potentially custom) name.
     * @returns {string} The entity's name without formatting (usually prefix & suffix).
     * @example
     * ```typescript
     * const name = entity.getName();
     * console.log(`Entity name: ${name}`);
     * ```
     */
    public getName(): string {
        return this.getFormattedUsername();
    }

    /**
     * Get the entity's formatted name.
     * @returns {string} The entity's formatted name (including prefix & suffix).
     * @example
     * ```typescript
     * const formattedName = entity.getFormattedUsername();
     * console.log(`Entity formatted name: ${formattedName}`);
     * ```
     */
    public getFormattedUsername(): string {
        return (
            this.metadata.getString(MetadataFlag.NAMETAG) ||
            // Replace all '_' with a ' ' and capitalize each word afterwards,
            // should probably be replaced with regex.
            ((this.constructor as any).MOB_ID as string)
                .split(':')[1]!
                .replaceAll('_', ' ')
                .split(' ')
                .map((word) => word[0]!.toUpperCase() + word.slice(1, word.length))
                .join(' ')
        );
    }
}
