import { Entity } from '../Entity';

export default class XpBottle extends Entity {
    public static MOB_ID = 'minecraft:xp_bottle';

    public override getType(): string {
        return XpBottle.MOB_ID;
    }
}
