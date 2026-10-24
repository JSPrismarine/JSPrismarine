import { Entity } from '../Entity';

export default class Bat extends Entity {
    public static MOB_ID = 'minecraft:bat';

    public override getType(): string {
        return Bat.MOB_ID;
    }
}
