import { Entity } from '../Entity';

export default class ZombieHorse extends Entity {
    public static MOB_ID = 'minecraft:zombie_horse';

    public override getType(): string {
        return ZombieHorse.MOB_ID;
    }
}
