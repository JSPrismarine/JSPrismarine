import { Entity } from '../Entity';

export default class EnderPearl extends Entity {
    public static MOB_ID = 'minecraft:ender_pearl';

    public override getType(): string {
        return EnderPearl.MOB_ID;
    }
}
