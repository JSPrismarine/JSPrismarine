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

    public async update(tick: number) {
        await super.update(tick);

        // Arbitrary magic number. Sue me.
        if (tick % 5 !== 0) return;

        // Move items of the same type closer to each other,
        // this is probably really bad code.
        const entities = (await this.getNearbyEntities(2)).filter((entity) => {
            if (entity.getType() !== this.getType()) return false;

            const item = entity as Item;
            if (item.item.getItem().getName() !== this.item.getItem().getName()) return false;

            return true;
        }) as Item[];

        // Get collisions, this should be done properly, and not here but in our parent.
        const collisions = entities.filter((e) => e.getPosition().equals(this.getPosition()));
        await Promise.all(collisions.map(async (e) => this.onCollide(e)));

        if (entities.length <= 0) return;

        // Only move to first item to prevent getting stuck
        const position = entities[0].getPosition();

        // TODO: move them closer to each other instead of teleporting
        // Interpolate?
        await this.setPosition(new Vector3(position.getX(), position.getY(), position.getZ()));
    }

    public async onCollide(entity: Entity) {
        if (!entity.isPlayer()) {
            if (entity.getType() === 'minecraft:item') {
                const item = entity as Item;

                if (item.item.getItem().getName() !== this.item.getItem().getName()) return;

                // Remove the other entity.
                await this.getWorld().removeEntity(entity);

                // Increase our count
                this.item.setCount(this.item.getCount() + item.item.getCount());

                // Send new spawn
                await Promise.all(
                    this.getWorld()
                        .getEntities()
                        .filter((e) => e.isPlayer())
                        .map(async (p) => this.sendSpawn(p as Player))
                );
            }

            return;
        }

        await this.getWorld().removeEntity(this);
        // TODO: pickup
    }
}
