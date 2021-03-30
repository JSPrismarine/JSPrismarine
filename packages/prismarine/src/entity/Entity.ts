import MetadataManager, { FlagType, MetadataFlag } from './Metadata';

import AddActorPacket from '../network/packet/AddActorPacket';
import AttributeManager from './Attribute';
import MoveActorAbsolutePacket from '../network/packet/MoveActorAbsolutePacket';
import Player from '../player/Player';
import Position from '../world/Position';
import { RemoveActorPacket } from '../network/Packets';
import Server from '../Server';
import Vector3 from '../math/Vector3';
import World from '../world/World';

// All entities will extend this base class
export default class Entity extends Position {
    protected static MOB_ID: string;
    public static runtimeIdCount = 0n;

    public runtimeId: bigint;

    private server: Server;
    // TODO: do not expose and make API instead
    private readonly metadata: MetadataManager = new MetadataManager();
    private readonly attributes: AttributeManager = new AttributeManager();

    /**
     * Entity constructor.
     *
     */
    public constructor(world: World, server: Server) {
        super({ world }); // TODO
        Entity.runtimeIdCount += 1n;
        this.runtimeId = Entity.runtimeIdCount;
        this.server = server;

        this.metadata.setLong(MetadataFlag.INDEX, 0n);
        this.metadata.setShort(MetadataFlag.MAX_AIR, 400);
        this.metadata.setLong(MetadataFlag.ENTITY_LEAD_HOLDER_ID, -1n);
        this.metadata.setFloat(MetadataFlag.SCALE, 1);
        this.metadata.setFloat(MetadataFlag.BOUNDINGBOX_WIDTH, 0.6);
        this.metadata.setFloat(MetadataFlag.BOUNDINGBOX_HEIGHT, 1.8);
        this.metadata.setShort(MetadataFlag.AIR, 0);

        this.setGenericFlag(MetadataFlag.AFFECTED_BY_GRAVITY, true);
        this.setGenericFlag(MetadataFlag.HAS_COLLISION, true);

        // Add this entity to the world
        void world?.addEntity(this);
    }

    public async update(tick: number) {
        // const collisions = await this.getNearbyEntities(0.5);
        // await Promise.all(collisions.map(async (e) => e.onCollide(this)));
    }

    // public setHealth(health: number): void {
    //    if (health === this.)
    // }

    public damage(): void {}

    public getServer(): Server {
        return this.server;
    }

    public setNameTag(name: string) {
        this.metadata.setString(MetadataFlag.NAMETAG, name);
    }

    public setDataFlag(propertyId: number, flagId: number, value = true, propertyType = FlagType.LONG) {
        // All generic flags are written as Longs (bigints) 64bit
        const flagId64 = BigInt(flagId);
        // Check if the same value is already set
        if (this.getDataFlag(propertyId, flagId64) !== value) {
            const flags = this.metadata.getPropertyValue(propertyId) as bigint;
            this.metadata.setPropertyValue(propertyId, propertyType, flags ^ (1n << flagId64));
        }
    }

    public getDataFlag(propertyId: number, flagId: bigint) {
        return ((this.metadata.getPropertyValue(propertyId) as bigint) & (1n << flagId)) > 0;
    }

    public setGenericFlag(flagId: number, value = true) {
        this.setDataFlag(flagId >= 64 ? 94 : MetadataFlag.INDEX, flagId % 64, value, FlagType.LONG);
    }

    public getAttributeManager(): AttributeManager {
        return this.attributes;
    }

    public getMetadataManager(): MetadataManager {
        return this.metadata;
    }

    public async sendSpawn(player: Player) {
        const pk = new AddActorPacket();
        pk.runtimeEntityId = this.runtimeId;
        pk.type = (this.constructor as any).MOB_ID; // TODO
        pk.x = this.getX();
        pk.y = this.getY();
        pk.z = this.getZ();
        // TODO: motion
        pk.motionX = 0;
        pk.motionY = 0;
        pk.motionZ = 0;
        pk.pitch = 0;
        pk.yaw = 0;
        pk.headYaw = 0;
        pk.metadata = this.metadata.getMetadata();
        await player.getConnection().sendDataPacket(pk);
    }

    public async sendDespawn(player: Player) {
        const pk = new RemoveActorPacket();
        pk.uniqueEntityId = this.runtimeId;
        await player.getConnection().sendDataPacket(pk);
    }

    public async setPosition(position: Vector3) {
        this.setX(position.getX());
        this.setY(position.getY());
        this.setZ(position.getZ());

        this.getServer()
            .getPlayerManager()
            .getOnlinePlayers()
            .filter((p) => p.getWorld().getUniqueId() === this.getWorld().getUniqueId())
            .map(async (player) => {
                const pk = new MoveActorAbsolutePacket();
                pk.runtimeEntityId = this.runtimeId;
                pk.position = this.getPosition();

                // TODO
                pk.rotationX = 0;
                pk.rotationY = 0;
                pk.rotationZ = 0;
                await player.getConnection().sendDataPacket(pk);
            });
    }

    public getPosition(): Vector3 {
        return new Vector3(this.getX(), this.getY(), this.getZ());
    }

    public isPlayer(): boolean {
        return false;
    }

    public getType(): string {
        return (this.constructor as any).MOB_ID;
    }

    public getName(): string {
        return this.getFormattedUsername();
    }

    public getFormattedUsername(): string {
        return (
            this.metadata.getString(MetadataFlag.NAMETAG) ??
            // Replace all '_' with a ' ' and capitalize each word afterwards
            ((this.constructor as any).MOB_ID as string)
                .split(':')[1]
                .replace(/_/g, ' ')
                .split(' ')
                .map((word) => word[0].toUpperCase() + word.slice(1, word.length))
                .join(' ')
        );
    }

    public async onCollide(entity: Entity) {}

    /**
     * Returns the nearest entity from the current entity
     *
     * TODO: Customizable radius
     * TODO: amount of results
     *
     * @param entities
     */
    public getNearestEntity(entities: Entity[] = this.server.getWorldManager().getDefaultWorld().getEntities()!) {
        const pos = new Vector3(this.getX(), this.getY(), this.getZ());
        const dist = (a: Vector3, b: Vector3) =>
            Math.sqrt((b.getX() - a.getX()) ** 2 + (b.getY() - a.getY()) ** 2 + (b.getZ() - a.getZ()) ** 2);

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
     * Get entities within radius of current entity
     * @param radius number
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

        return res;
    }
}
