import MetadataManager, { FlagType, MetadataFlag } from './metadata';

import AddActorPacket from '../network/packet/AddActorPacket';
import AttributeManager from './attribute';
import Player from '../player/Player';
import Position from '../world/Position';
import World from '../world/World';

// All entities will extend this base class
export default class Entity extends Position {
    protected static MOB_ID: string;
    public static runtimeIdCount = 0n;

    public runtimeId: bigint;

    // TODO: do not expose and make API instead
    private readonly metadata: MetadataManager = new MetadataManager();
    private readonly attributes: AttributeManager = new AttributeManager();

    /**
     * Entity constructor.
     *
     */
    constructor(world: World) {
        super({ world }); // TODO
        this.runtimeId = Entity.runtimeIdCount += 1n;

        this.metadata.setLong(MetadataFlag.INDEX, 0n);
        this.metadata.setShort(MetadataFlag.MAX_AIR, 400);
        this.metadata.setLong(MetadataFlag.ENTITY_LEAD_HOLDER_ID, -1n);
        this.metadata.setFloat(MetadataFlag.SCALE, 1);
        this.metadata.setFloat(MetadataFlag.BOUNDINGBOX_WIDTH, 0.6);
        this.metadata.setFloat(MetadataFlag.BOUNDINGBOX_HEIGHT, 1.8);
        this.metadata.setShort(MetadataFlag.AIR, 0);

        this.setGenericFlag(MetadataFlag.AFFECTED_BY_GRAVITY, true);
        this.setGenericFlag(MetadataFlag.HAS_COLLISION, true);

        // TODO: level.addEntity(this)
    }

    public setNameTag(name: string) {
        this.metadata.setString(MetadataFlag.NAMETAG, name);
    }

    public setDataFlag(
        propertyId: number,
        flagId: number,
        value = true,
        propertyType = FlagType.LONG
    ) {
        // All generic flags are written as Longs (bigints) 64bit
        const flagId64 = BigInt(flagId);
        // Check if the same value is already set
        if (this.getDataFlag(propertyId, flagId64) !== value) {
            const flags = this.metadata.getPropertyValue(propertyId) as bigint;
            this.metadata.setPropertyValue(
                propertyId,
                propertyType,
                flags ^ (1n << flagId64)
            );
        }
    }

    public getDataFlag(propertyId: number, flagId: bigint) {
        return (
            ((this.metadata.getPropertyValue(propertyId) as bigint) &
                (1n << flagId)) >
            0
        );
    }

    public setGenericFlag(flagId: number, value = true) {
        this.setDataFlag(
            flagId >= 64 ? 94 : MetadataFlag.INDEX,
            flagId % 64,
            value,
            FlagType.LONG
        );
    }

    public getAttributeManager(): AttributeManager {
        return this.attributes;
    }

    public getMetadataManager(): MetadataManager {
        return this.metadata;
    }

    public async sendSpawn(player: Player) {
        // Recursive import, find another way
        const pk = new AddActorPacket();
        pk.runtimeEntityId = ++Entity.runtimeIdCount;
        pk.type = (this.constructor as any).MOB_ID; // TODO
        pk.x = player.getX();
        pk.y = player.getY();
        pk.z = player.getZ();
        // TODO: motion
        pk.motionX = 0;
        pk.motionY = 0;
        pk.motionZ = 0;
        await player.getConnection().sendDataPacket(pk);
    }
}
