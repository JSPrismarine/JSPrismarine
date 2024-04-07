import { AddItemActorPacket } from '../../network/Packets';
import type ContainerEntry from '../../inventory/ContainerEntry';
import { Entity } from '../Entity';
import type Player from '../../Player';
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

    public async sendSpawn(player?: Player) {
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
            if (item.item.getItem().getName() !== this.item.getItem().getName()) return false;

            return true;
        }) as Item[];

        // Only move to first item to prevent them getting stuck
        const position = entities.find((e) => !e.getPosition().equals(this.getPosition()))?.getPosition();
        if (!position) return;

        // TODO: move them closer to each other instead of teleporting
        // Interpolate?
        await this.setPosition(new Vector3(position.getX(), position.getY(), position.getZ()));
    }

    public async onCollide(entity: Entity) {
        if (!entity.isPlayer()) {
            /* if (entity.getType() === 'minecraft:item') {
                const item = entity as Item;

                if (item.item.getItem().getName() !== this.item.getItem().getName()) return;

                // Remove the other entity.
                await this.getWorld().removeEntity(entity);

                // Increase our count
                this.item.setCount(this.item.getCount() + item.item.getCount());

                this.sendSpawn();
            } */

            return;
        }

        await this.getWorld().removeEntity(this);

        const player = entity as Player;
        player.getInventory().addItem(this.item);
        await player.getNetworkSession().sendInventory();
    }
}
