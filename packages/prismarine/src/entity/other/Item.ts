import { AddItemActorPacket } from '../../network/Packets';
import type ContainerEntry from '../../inventory/ContainerEntry';
import Entity from '../Entity';
import Player from '../../player/Player';
import type Server from '../../Server';
import Vector3 from '../../math/Vector3';
import type World from '../../world/World';

export default class Item extends Entity {
    public static MOB_ID = 'minecraft:item';
    private item: ContainerEntry;

    public constructor(world: World, server: Server, item: ContainerEntry) {
        super(world, server);

        this.item = item;
    }

    public async sendSpawn(player: Player) {
        const pk = new AddItemActorPacket();
        pk.runtimeEntityId = this.runtimeId;
        pk.position = new Vector3(this.getX(), this.getY(), this.getZ()); // We could just use 'this', but that would give the packet access to a lot of unnecessary data
        pk.item = this.item;

        await player.getConnection().sendDataPacket(pk);
    }
}
