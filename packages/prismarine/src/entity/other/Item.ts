import { Vector3 } from '@jsprismarine/math';
import type Player from '../../Player';
import type ContainerEntry from '../../inventory/ContainerEntry';
import { AddItemActorPacket } from '../../network/Packets';
import { Entity } from '../Entity';

export class Item extends Entity {
    public static MOB_ID = 'minecraft:item';
    private item?: ContainerEntry;

    public constructor({
        item,
        ...options
    }: ConstructorParameters<typeof Entity>[0] & {
        item?: ContainerEntry;
    }) {
        super(options);

        this.item = item;
    }

    public async sendSpawn(player?: Player) {
        if (!this.item) return;

        const players: Player[] = player
            ? [player]
            : (this.getWorld()
                  .getEntities()
                  .filter((entity) => entity.isPlayer()) as Player[]);

        const pk = new AddItemActorPacket();
        pk.runtimeEntityId = this.getRuntimeId();
        pk.position = new Vector3(this.getX(), this.getY(), this.getZ());
        pk.item = this.item.getItem();

        await Promise.all(players.map(async (p) => p.getNetworkSession().getConnection().sendDataPacket(pk)));
    }

    public async update(tick: number) {
        await super.update(tick);
    }
}
