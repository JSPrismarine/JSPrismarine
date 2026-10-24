import { Entity } from '../Entity';

export default class Panda extends Entity {
    public static MOB_ID = 'minecraft:panda';

    public override getType(): string {
        return Panda.MOB_ID;
    }
}
