import MetadataManager, { FlagType, MetadataFlag } from './Metadata.js';

import AddActorPacket from '../network/packet/AddActorPacket.js';
import AttributeManager from './Attribute.js';
import MoveActorAbsolutePacket from '../network/packet/MoveActorAbsolutePacket.js';
import Player from '../Player.js';
import Position from '../world/Position.js';
import RemoveActorPacket from '../network/packet/RemoveActorPacket.js';
import Server from '../Server.js';
import TextType from '../network/type/TextType.js';
import Vector3 from '../math/Vector3.js';
import World from '../world/World.js';

/**
 * The base class for all entities including `Player`.
 *
 * @public
 */
export default class Entity extends Position {
    /**
     * The entity's namespace ID.
     */
    protected static MOB_ID: string;

    public static runtimeIdCount = 0n;

    private runtimeId: bigint;

    protected server: Server;

    /**
     * @remarks
     * TODO: proper manager
     *
     * @deprecated
     */
    private readonly metadata: MetadataManager = new MetadataManager();

    /**
     * @remarks
     * TODO: proper manager
     *
     * @deprecated
     */
    private readonly attributes: AttributeManager = new AttributeManager();

    /**
     * Entity constructor.
     */
    public constructor(world: World, server: Server) {
        super({ world }); // TODO
        Entity.runtimeIdCount += 1n;
        this.runtimeId = Entity.runtimeIdCount;
        this.server = server;

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

    /**
     * Get the entity's runtime id.
     */
    public getRuntimeId(): bigint {
        return this.runtimeId;
    }

    /**
     * Fired every tick from the event subscription in the constructor.
     *
     * @param _tick current tick
     */
    public async update(_tick: number) {
        const collisions = await this.getNearbyEntities(0.5);
        await Promise.all(collisions.map(async (e) => e.onCollide(this)));
    }

    public getServer(): Server {
        return this.server;
    }

    public setNameTag(name: string) {
        this.metadata.setString(MetadataFlag.NAMETAG, name);
    }

    /**
     * @deprecated
     */
    public setDataFlag(propertyId: number, flagId: number, value = true, propertyType = FlagType.LONG) {
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
     */
    public getDataFlag(propertyId: number, flagId: bigint) {
        return ((this.metadata.getPropertyValue(propertyId) as bigint) & (1n << flagId)) > 0;
    }

    /**
     * @deprecated
     */
    public setGenericFlag(flagId: number, value = true) {
        this.setDataFlag(flagId >= 64 ? 94 : MetadataFlag.INDEX, flagId % 64, value, FlagType.LONG);
    }

    /**
     * @deprecated
     */
    public getAttributeManager(): AttributeManager {
        return this.attributes;
    }

    /**
     * @deprecated
     */
    public getMetadataManager(): MetadataManager {
        return this.metadata;
    }

    /**
     * Spawn the entity.
     * @param player optional - if specified, only send the packet to that player
     *
     * @remarks
     * `motion`, `pitch` & `yaw` is unimplemented.
     *
     * @beta
     */
    public async sendSpawn(player?: Player) {
        const players: Player[] = player
            ? [player]
            : (this.getWorld()
                  .getEntities()
                  .filter((e) => e.isPlayer()) as Player[]);

        const pk = new AddActorPacket();
        pk.runtimeEntityId = this.getRuntimeId();
        pk.type = (this.constructor as any).MOB_ID; // TODO
        pk.position = this;
        // TODO: motion
        pk.motion = new Vector3(0, 0, 0);
        pk.pitch = 0;
        pk.yaw = 0;
        pk.headYaw = 0;
        pk.metadata = this.metadata.getMetadata();
        await Promise.all(players.map(async (p) => p.getNetworkSession().getConnection().sendDataPacket(pk)));
    }

    /**
     * Despawn the entity.
     * @param player optional - if specified, only send the packet to that player
     */
    public async sendDespawn(player?: Player) {
        const players: Player[] = player
            ? [player]
            : (this.getWorld()
                  .getEntities()
                  .filter((e) => e.isPlayer()) as Player[]);

        const pk = new RemoveActorPacket();
        pk.uniqueEntityId = this.runtimeId;
        await Promise.all(players.map(async (p) => p.getNetworkSession().getConnection().sendDataPacket(pk)));
    }

    /**
     * Set entity's position and notify the clients.
     *
     * @param position The position
     */
    public async setPosition(position: Vector3) {
        await this.setX(position.getX(), true);
        await this.setY(position.getY(), true);
        await this.setZ(position.getZ(), true);

        await this.sendPosition();
    }

    /**
     * Send the position to all the players in the same world.
     */
    public async sendPosition() {
        this.getServer()
            .getSessionManager()
            .getAllPlayers()
            .filter((p) => p.getWorld().getUniqueId() === this.getWorld().getUniqueId())
            .map(async (player) => {
                const pk = new MoveActorAbsolutePacket();
                pk.runtimeEntityId = this.runtimeId;
                pk.position = this.getPosition();

                // TODO
                pk.rotationX = 0;
                pk.rotationY = 0;
                pk.rotationZ = 0;
                await player.getNetworkSession().getConnection().sendDataPacket(pk);
            });
    }

    /**
     * Send a message to an entity.
     *
     * @remarks
     * This will silently fail on non-client-controlled entities.
     *
     * @example
     * Send "Hello World!" to a client:
     *
     * ```ts
     * entity.sendMessage('Hello World!');
     * ```
     *
     * @param message The message
     * @param type The text type
     */
    public sendMessage(_message: string, _type: TextType = TextType.Raw) {}

    /**
     * Get the entity's position.
     *
     * @returns The entity's position
     */
    public getPosition(): Vector3 {
        return new Vector3(this.getX(), this.getY(), this.getZ());
    }

    /**
     * Set the x position.
     *
     * @param x The x coordinate
     * @param suppress If true the client won't be notified about the position change
     */
    public async setX(x: number, suppress?: boolean) {
        super.setX.bind(this)(x);
        if (suppress && !this.isPlayer()) await this.sendPosition();
    }
    /**
     * Set the y position.
     *
     * @param y The y coordinate
     * @param suppress If true the client won't be notified about the position change
     */
    public async setY(y: number, suppress?: boolean) {
        super.setY.bind(this)(y);
        if (!suppress && !this.isPlayer()) await this.sendPosition();
    }
    /**
     * Set the z position.
     *
     * @param z The z coordinate
     * @param suppress If true the client won't be notified about the position change
     */
    public async setZ(z: number, suppress?: boolean) {
        super.setZ.bind(this)(z);
        if (!suppress && !this.isPlayer()) await this.sendPosition();
    }

    /**
     * Check if the entity is a player.
     *
     * @returns `true` if the entity is client-controlled otherwise `false`
     */
    public isPlayer(): boolean {
        return false;
    }

    /**
     * Check if the entity is a console instance.
     *
     * @returns `true` if the entity is console-controlled otherwise `false`
     */
    public isConsole(): boolean {
        return false;
    }

    /**
     * Get entity type.
     *
     * @returns The entity's namespace ID.
     */
    public getType(): string {
        return (this.constructor as any).MOB_ID;
    }

    /**
     * Get the entity's (potentially custom) name.
     *
     * @returns The entity's name without formatting (usually prefix & suffix).
     */
    public getName(): string {
        return this.getFormattedUsername();
    }

    /**
     * Get the entity's formatted name.
     *
     * @returns The entity's formatted name (including prefix & suffix).
     */
    public getFormattedUsername(): string {
        return (
            this.metadata.getString(MetadataFlag.NAMETAG) ??
            // Replace all '_' with a ' ' and capitalize each word afterwards,
            // should probably be replaced with regex.
            ((this.constructor as any).MOB_ID as string)
                .split(':')[1]
                .replaceAll('_', ' ')
                .split(' ')
                .map((word) => word[0].toUpperCase() + word.slice(1, word.length))
                .join(' ')
        );
    }

    /**
     * Fired when an entity collides with another entity.
     
     * @param entity the entity collided with
     */
    public async onCollide(_entity: Entity) {}

    /**
     * Returns the nearest entity from the current entity.
     *
     * @remarks
     * TODO: Customizable radius
     *
     * @param entities optional, the entities to compare the distance between
     *
     * @beta
     */
    public getNearestEntity(entities: Entity[] = this.getWorld().getEntities()!) {
        const pos = new Vector3(this.getX(), this.getY(), this.getZ());
        const dist = (a: Vector3, b: Vector3) =>
            Math.hypot(b.getX() - a.getX(), b.getY() - a.getY(), b.getZ() - a.getZ());

        const closest = (target: Vector3, points: Entity[], eps = 0.00001) => {
            const distances = points.map((e) => dist(target, new Vector3(e.getX(), e.getY(), e.getZ())));
            const closest = Math.min(...distances);
            return points.find((e, i) => distances[i] - closest < eps)!;
        };

        return [
            closest(
                pos,
                entities.filter((a) => a.runtimeId !== this.runtimeId)
            )
        ].filter((a) => a);
    }

    /**
     * Get entities within radius of current entity.
     *
     * @param radius number
     *
     * @returns The entities within the specified radius sorted
     *
     * @beta
     */
    public async getNearbyEntities(radius: number): Promise<Entity[]> {
        const entities = this.getWorld().getEntities();
        const position = this.getPosition();

        const min = new Vector3(position.getX() - radius, position.getY() - radius, position.getZ() - radius);
        const max = new Vector3(position.getX() + radius, position.getY() + radius, position.getZ() + radius);

        const res = entities.filter((entity) => {
            if (entity.runtimeId === this.runtimeId) return false;

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
