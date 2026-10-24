import { Entity } from '../Entity';

export default class Shulker extends Entity {
    public static MOB_ID = 'minecraft:shulker';

    public override getType(): string {
        return Shulker.MOB_ID;
    }
}
