import World from "../world/world";

const { MetadataManager, MetadataFlag, FlagType} = require('./metadata');
const { AttributeManager } = require('./attribute');
const Position = require('../world/position');
const AddActorPacket = require('../network/packet/add-actor');

// All entities will extend this base class
export default class Entity extends Position {
    public static MOB_ID: number;
    public static runtimeIdCount = 0;

    public runtimeId: number;

    public metadata: any = new MetadataManager();
    public attributes: any = new AttributeManager();

    public chunk: any; // TODO

    /**
     * Entity constructor.
     * 
     * @param world 
     */
    constructor(world: World) {
        super(undefined, undefined, undefined, world);  // TODO
        this.runtimeId = Entity.runtimeIdCount += 1;

        this.metadata.setLong(MetadataFlag.Index, 0);
        this.metadata.setShort(MetadataFlag.MaxAir, 400);
        this.metadata.setLong(MetadataFlag.EntityLeadHolderId, -1);
        this.metadata.setFloat(MetadataFlag.Scale, 1);
        this.metadata.setFloat(MetadataFlag.BoundingBoxWidth, 0.6);
        this.metadata.setFloat(MetadataFlag.BoundingBoxHeight, 1.8);
        this.metadata.setShort(MetadataFlag.Air, 0); 

        this.setGenericFlag(MetadataFlag.AffectedByGravity, true);
        this.setGenericFlag(MetadataFlag.HasCollision, true);

        // TODO: level.addEntity(this)
    }

    public setNameTag(name: string) {
        this.metadata.setString(MetadataFlag.Nametag, name);
    }

    public setDataFlag(propertyId: number, flagId: number, value = true, propertyType = FlagType.Long) {
        if (this.getDataFlag(propertyId, flagId) !== value) {
            let flags = this.metadata.getPropertyValue(propertyId, propertyType);
            let biFlags = BigInt(flags);
            biFlags ^= (1n << BigInt(flagId));
            this.metadata.setPropertyValue(propertyId, propertyType, biFlags);
        }
    }

    public getDataFlag(propertyId: number, flagId: number) {
        // After appending the first flag, it is now a bigint and for further flags
        // we need to handle it like that
        if (typeof this.metadata.getPropertyValue(propertyId) === 'bigint') {
            return (this.metadata.getPropertyValue(propertyId) & (1n << BigInt(flagId))) > 0;
        } 
        return (this.metadata.getPropertyValue(propertyId) & (1 << flagId)) > 0;
    }

    public setGenericFlag(flagId: number, value = true) {
        this.setDataFlag(flagId >= 64 ? 94 : MetadataFlag.Index, flagId % 64, value, FlagType.Long);
    }

    public sendSpawn(player: any) {  // Recursive import, find another way  
        let pk = new AddActorPacket();
        pk.runtimeEntityId = Entity.runtimeIdCount += 1;
        // @ts-ignore
        pk.type = this.constructor.MOB_ID;  // TODO
        pk.x = player.x;
        pk.y = player.y;
        pk.z = player.z;
        // TODO: motion
        pk.motionX = 0; 
        pk.motionY = 0;
        pk.motionZ = 0;
        player.sendDataPacket(pk);
    }

}
module.exports = Entity;
