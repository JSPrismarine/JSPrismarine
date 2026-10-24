import { Entity } from '../Entity';

export default class OldVillager extends Entity {
    public static MOB_ID = 'minecraft:villager';

    public override getType(): string {
        return OldVillager.MOB_ID;
    }
}
