import type Player from '../../Player';
import type ContainerEntry from '../../inventory/ContainerEntry';
import Vector3 from '../../math/Vector3';
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
                  .filter((e) => e.isPlayer()) as Player[]);

        const pk = new AddItemActorPacket();
        pk.runtimeEntityId = this.getRuntimeId();
        pk.position = new Vector3(this.getX(), this.getY(), this.getZ());
        pk.item = this.item.getItem();

        await Promise.all(players.map(async (p) => p.getNetworkSession().getConnection().sendDataPacket(pk)));
    }

    public async update(tick: number) {
        // Call supermethod
        await super.update.bind(this)(tick);

        // Arbitrary magic number. Sue me.
        // This is done to prevent running the code each tick
        // since it's currently an extremely expensive task.
        if (tick % 5 !== 0) return;

        // Move items of the same type closer to each other,
        // this is probably really bad code.
        const entities = (await this.getNearbyEntities(2)).filter((entity) => {
            if (entity.getType() !== this.getType()) return false;

            const item = entity as Item;
            if (!item.item) return false;

            if (item.item.getItem().getName() !== this.item?.getItem().getName()) return false;

            return true;
        }) as Item[];

        // Only move to first item to prevent them getting stuck
        const position = entities.find((e) => !e.getPosition().equals(this.getPosition()))?.getPosition();
        if (!position) return;

        // TODO: move them closer to each other instead of teleporting
        // Interpolate?
        await this.setPosition({
            position: new Vector3(position.getX(), position.getY(), position.getZ())
        });
    }
}
