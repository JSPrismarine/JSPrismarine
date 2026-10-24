import { Entity } from '../Entity';

export default class Bee extends Entity {
    public static MOB_ID = 'minecraft:bee';

    public override getType(): string {
        return Bee.MOB_ID;
    }
}
