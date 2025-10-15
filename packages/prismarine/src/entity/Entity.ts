import type { Vector3 } from '@jsprismarine/math';
import type Server from '../Server';
import type { Position } from '../world/Position';
import type { World } from '../world/World';
import { Attributes } from './Attribute';
import { Metadata, MetadataFlag } from './Metadata';

/**
 * The base class for all entities including `Player`.
 * @class
 * @public
 */
export class Entity {
    /**
     * The entity's namespace ID.
     * TODO: may break stuff if network serialized.
     */
    protected static MOB_ID: string = 'jsprismarine:unknown_entity';
    /**
     * The global runtime id counter.
     * @internal
     */
    public static runtimeIdCount = 0n;

    protected readonly server: Server;

    /**
     * The entity's runtime id.
     * @internal
     */
    protected readonly runtimeId: bigint;

    // TODO: convert them to vectors
    public pitch = 0;
    public yaw = 0;
    public headYaw = 0;

    protected position: Position;

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
     * @param {Position} position - The entity position.
     * @returns {Entity} The entity instance.
     * @example
     * ```typescript
     * const entity = new Entity(new Position(0, 0, 0, world));
     * ```
     */
    public constructor(position: Position) {
        this.runtimeId = Entity.runtimeIdCount += 1n;
        this.position = position;
        this.server = position.getWorld().getServer();
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
        return `runtimeId: §a${this.getRuntimeId()}§r, name: §b${this.getName()}§r, type: §b${this.getType()}§r, position: §b${this.position.toString()}`;
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
     * Get the entity's position.
     * @returns {Vector3} The entity's position.
     * @example
     * ```typescript
     * const position = entity.getPosition();
     * ```
     */
    public getPosition(): Vector3 {
        return this.position;
    }

    /**
     * Gets the world that the entity is currently in.
     * @returns {World} The world object.
     */
    public getWorld(): World {
        return this.position.getWorld();
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

    public async sendPosition(): Promise<void> {
        // TODO: remove this trash
        // update position based on the player viewer system
        // so we don't spawn useless packets
        // keeping the method just as a placeholder
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
        void suppress;
        this.position.setX(x);
        await this.sendPosition();
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
        void suppress;
        this.position.setY(y);
        await this.sendPosition();
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
        void suppress;
        this.position.setZ(z);
        await this.sendPosition();
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

        this.setX(position.getX());
        this.setY(position.getY());
        this.setZ(position.getZ());

        await this.sendPosition();
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
        const distance = (a: Vector3, b: Vector3) =>
            Math.hypot(b.getX() - a.getX(), b.getY() - a.getY(), b.getZ() - a.getZ());

        const closest = (target: Vector3, points: Entity[], eps = 0.00001) => {
            const distances = points.map((e) => distance(target, e.getPosition()));
            const closest = Math.min(...distances);
            return points.find((_e, i) => distances[i]! - closest < eps)!;
        };

        return [
            closest(
                this.getPosition(),
                entities.filter((entity) => entity.getRuntimeId() !== this.runtimeId)
            )
        ];
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
}
