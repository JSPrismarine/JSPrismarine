import { Entity } from '../Entity';

export default class OldZombieVillager extends Entity {
    public static MOB_ID = 'minecraft:zombie_villager';

    public override getType(): string {
        return OldZombieVillager.MOB_ID;
    }
}
