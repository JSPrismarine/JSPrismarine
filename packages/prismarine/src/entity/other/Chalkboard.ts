import { Entity } from '../Entity';

export default class Chalkboard extends Entity {
    public static MOB_ID = 'minecraft:chalkboard';

    public override getType(): string {
        return Chalkboard.MOB_ID;
    }
}
