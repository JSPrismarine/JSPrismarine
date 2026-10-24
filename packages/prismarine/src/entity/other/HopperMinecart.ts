import { Entity } from '../Entity';

export default class HopperMinecart extends Entity {
    public static MOB_ID = 'minecraft:hopper_minecart';

    public override getType(): string {
        return HopperMinecart.MOB_ID;
    }
}
