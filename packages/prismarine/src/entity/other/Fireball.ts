import { Entity } from '../Entity';

export default class Fireball extends Entity {
    public static MOB_ID = 'minecraft:fireball';

    public override getType(): string {
        return Fireball.MOB_ID;
    }
}
