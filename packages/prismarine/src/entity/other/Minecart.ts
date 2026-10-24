import { Entity } from '../Entity';

export default class Minecart extends Entity {
    public static MOB_ID = 'minecraft:minecart';

    public override getType(): string {
        return Minecart.MOB_ID;
    }
}
