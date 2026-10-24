import { Entity } from '../Entity';

export default class Vex extends Entity {
    public static MOB_ID = 'minecraft:vex';

    public override getType(): string {
        return Vex.MOB_ID;
    }
}
