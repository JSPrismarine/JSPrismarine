import { Entity } from '../Entity';

export default class EnderDragon extends Entity {
    public static MOB_ID = 'minecraft:ender_dragon';

    public override getType(): string {
        return EnderDragon.MOB_ID;
    }
}
