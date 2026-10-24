import { Entity } from '../Entity';

export default class Parrot extends Entity {
    public static MOB_ID = 'minecraft:parrot';

    public override getType(): string {
        return Parrot.MOB_ID;
    }
}
