import { Entity } from '../Entity';

export default class Ravager extends Entity {
    public static MOB_ID = 'minecraft:ravager';

    public override getType(): string {
        return Ravager.MOB_ID;
    }
}
