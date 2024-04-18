import { Vector3 } from '@jsprismarine/math';
import AddActorPacket from '../network/packet/AddActorPacket';
import MoveActorAbsolutePacket from '../network/packet/MoveActorAbsolutePacket';
import RemoveActorPacket from '../network/packet/RemoveActorPacket';
import TextType from '../network/type/TextType';
import type Player from '../Player';
import type Server from '../Server';
import UUID from '../utils/UUID';
import Position from '../world/Position';
import { Attributes } from './Attribute';
import { Metadata, MetadataFlag } from './Metadata';

/**
 * Entity-like class.
 * @internal
 */
export class EntityLike extends Position {
    protected readonly uuid: string;
    protected readonly runtimeId: bigint;
    protected readonly server: Server;

    public pitch: number;
    public yaw: number;
    public headYaw: number;

    /**
     * EntityLike constructor.
     * @constructor
     * @param {object} options - The entity-like options.
     * @param {string} options.uuid - The entity's runtime id.
     * @param {bigint} options.runtimeId - The entity's runtime id.
     * @param {Server} options.server - The server instance.
     * @param {World} [options.world] - The world the entity belongs to.
     * @param {number} [options.pitch=0] - The pitch.
     * @param {number} [options.yaw=0] - The yaw.
     * @param {number} [options.headYaw=0] - The head yaw.
     * @returns {EntityLike} The entity-like instance.
     */
    public constructor({
        uuid,
        runtimeId,
        pitch = 0,
        yaw = 0,
        headYaw = 0,
        ...options
    }: ConstructorParameters<typeof Position>[0] & {
        uuid?: string;
        runtimeId: bigint;
        pitch?: number;
        yaw?: number;
        headYaw?: number;
    }) {
        super(options); // TODO

        this.uuid = uuid ?? UUID.randomString();
        this.runtimeId = runtimeId;
        this.server = options.server;

        this.pitch = pitch;
        this.yaw = yaw;
        this.headYaw = headYaw;
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
}

/**
 * The base class for all entities including `Player`.
 * @public
 */
export class Entity extends EntityLike {
    /**
     * The entity's namespace ID.
     */
    protected static MOB_ID: string = 'jsprismarine:unknown_entity';

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
     * Entity metadata.
     */
    public readonly metadata = new Metadata();

    /**
     * Entity attributes.
     */
    public readonly attributes = new Attributes();

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
    public constructor({ world, ...options }: Omit<ConstructorParameters<typeof EntityLike>[0], 'runtimeId'>) {
        super({
            world,
            ...options,
            runtimeId: Entity.generateRuntimeId().next().value
        });

        if (world) super.setWorld(world);
    }

    public get [Symbol.toStringTag](): string {
        return `Entity(${this.toString()})`;
    }

    /**
     * Convert to a string representation.
     * @returns {string} The string.
     * ```typescript
     * console.log(entity.toString());
     * ```
     */
    public toString() {
        return `uuid: §a${this.getUUID()}§r, id: §a${this.getRuntimeId()}§r, name: §b${this.getName()}§r, type: §b${this.getType()}§r, ${super.toString()}`;
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
     * ```typescript
     * console.log(entity.getUUID());
     * ```
     */
    public getUUID(): string {
        return this.uuid;
    }

    /**
     * Fired every tick from the event subscription in the constructor.
     * @param {number} _tick - The current world-tick.
     * @returns {Promise<void>} A promise that resolves when the update is complete.
     * @example
     * ```typescript
     * entity.update(10);
     * ```
     */
    public async update(_tick: number): Promise<void> {}

    /**
     * Get the server instance.
     * @returns {Server} The server instance.
     * @example
     * ```typescript
     * const server = entity.getServer();
     * // Do things with the server.
     * ```
     */
    public getServer(): Server {
        return this.server;
    }

    /**
     * Spawn the entity.
     * @todo `motion`, `pitch` & `yaw` is unimplemented.
     * @param {Player} [player] - The player to send the packet to.
     * @returns {Promise<void>} A promise that resolves when the entity is spawned.
     */
    public async sendSpawn(player?: Player): Promise<void> {
        const players: Player[] = player ? [player] : this.getWorld().getPlayers();

        const packet = new AddActorPacket();
        packet.runtimeEntityId = this.getRuntimeId();
        packet.type = (this.constructor as any).MOB_ID; // TODO
        packet.position = this.getPosition();
        packet.motion = new Vector3(0, 0, 0); // TODO: motion
        packet.pitch = this.pitch;
        packet.yaw = this.yaw;
        packet.headYaw = this.headYaw;
        packet.metadata = this.metadata;
        await Promise.all(players.map(async (p) => p.getNetworkSession().send(packet)));
    }

    /**
     * Despawn the entity.
     * @param {Player} [player] - The player to send the packet to, if not specified, all players in the world will receive the packet.
     * @returns {Promise<void>} A promise that resolves when the entity is despawned.
     */
    public async sendDespawn(player?: Player): Promise<void> {
        const players: Player[] = player ? [player] : this.getWorld().getPlayers();

        const packet = new RemoveActorPacket();
        packet.uniqueEntityId = this.runtimeId;
        await Promise.all(players.map(async (player) => player.getNetworkSession().send(packet)));
    }

    /**
     * Send the position to all the players in the same world.
     * @returns {Promise<void>} A promise that resolves when the position is sent.
     */
    public async sendPosition(): Promise<void> {
        await Promise.all(
            this.getWorld()
                .getPlayers()
                .map((target) => {
                    const packet = new MoveActorAbsolutePacket();
                    packet.runtimeEntityId = this.runtimeId;
                    packet.position = this.getPosition();
                    return target.getNetworkSession().send(packet);
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
        this.server.getLogger().warn(`Entity/sendMessage is not implemented: (message: ${message}, type: ${type})`);
    }

    /**
     * Set the `x` position.
     * @param {number} x - The `x` coordinate.
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
     * Set the `y` position.
     * @param {number} y - The `y` coordinate.
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
     * Set the `z` position.
     * @param {number} z - The `z` coordinate.
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
     * @param {object} options - The position options.
     * @param {Vector3} options.position - The position.
     * @param {number} [options.pitch] - The pitch.
     * @param {number} [options.yaw] - The yaw.
     * @param {number} [options.headYaw] - The head yaw.
     * @returns {Promise<void>} A promise that resolves when the position is set.
     */
    public async setPosition({
        position,
        pitch = this.pitch,
        yaw = this.yaw,
        headYaw = this.headYaw
    }: {
        position: Vector3;
        pitch?: number;
        yaw?: number;
        headYaw?: number;
    }): Promise<void> {
        this.pitch = pitch;
        this.yaw = yaw;
        this.headYaw = headYaw;

        await super.setX(position.getX());
        await super.setY(position.getY());
        await super.setZ(position.getZ());

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
     * Set the entity's name.
     * @param {string} name - The name.
     * @example
     * ```typescript
     * entity.setName('Mr. Sheep');
     * ```
     */
    public setName(name: string): void {
        this.metadata.setNameTag(name);
    }

    /**
     * Get the entity's formatted name.
     * @returns {string} The entity's formatted name (including prefix & suffix).
     * @example
     * ```typescript
     * const formattedName = entity.getFormattedUsername();
     * console.log(`Entity formatted name: ${formattedName}`); // Entity formatted name: Sheep
     * ```
     */
    public getFormattedUsername(): string {
        return (
            this.metadata.getString(MetadataFlag.NAMETAG) ||
            // Replace all '_' with a ' ' and capitalize each word afterwards,
            // should probably be replaced with regex.
            (((this.constructor as any)?.MOB_ID as string) || 'Unknown Entity')
                .split(':')[1]!
                .replaceAll('_', ' ')
                .split(' ')
                .map((word) => word[0]!.toUpperCase() + word.slice(1, word.length))
                .join(' ')
        );
    }

    /**
     * Generates the runtime id of each entity.
     * Should not be used elsewhere.
     * @internal
     */
    private static *generateRuntimeId(): Generator<bigint> {
        let rid = 0n;
        yield rid++;
    }
}
