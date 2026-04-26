import Player from '../../Player';
import type ContainerEntry from '../../inventory/ContainerEntry';
import { AddItemActorPacket } from '../../network/Packets';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import { Entity } from '../Entity';

export class Item extends Entity {
    public static MOB_ID = 'minecraft:item';
    private item?: ContainerEntry;

    public constructor({
        item,
        world
    }: ConstructorParameters<typeof Entity>[0] & {
        item?: ContainerEntry;
        world: World;
    }) {
        super(new Position(0, 0, 0, world)); // TODO

        this.item = item;
    }

    public async sendSpawn(player?: Player) {
        if (!this.item) return;

        const players: Player[] = player
            ? [player]
            : (this.getWorld()
                  .getEntities()
                  .filter((entity: any) => entity instanceof Player) as Player[]);

        const pk = new AddItemActorPacket();
        pk.runtimeEntityId = this.getRuntimeId();
        pk.position = this.getPosition();
        pk.item = this.item.getItem();

        await Promise.all(players.map(async (p) => p.getNetworkSession().getConnection().sendDataPacket(pk)));
    }

    public async update(tick: number) {
        await super.update(tick);
    }
}
