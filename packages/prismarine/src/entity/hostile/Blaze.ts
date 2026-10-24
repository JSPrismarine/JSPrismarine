import { Entity } from '../Entity';

export default class Blaze extends Entity {
    public static MOB_ID = 'minecraft:blaze';

    public override getType(): string {
        return Blaze.MOB_ID;
    }
}
