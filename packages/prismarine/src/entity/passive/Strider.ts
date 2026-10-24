import { Entity } from '../Entity';

export default class Strider extends Entity {
    public static MOB_ID = 'minecraft:strider';

    public override getType(): string {
        return Strider.MOB_ID;
    }
}
