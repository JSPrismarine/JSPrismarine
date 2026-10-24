import { Entity } from '../Entity';

export default class Pillager extends Entity {
    public static MOB_ID = 'minecraft:pillager';

    public override getType(): string {
        return Pillager.MOB_ID;
    }
}
