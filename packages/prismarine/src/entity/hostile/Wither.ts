import { Entity } from '../Entity';

export default class Wither extends Entity {
    public static MOB_ID = 'minecraft:wither';

    public override getType(): string {
        return Wither.MOB_ID;
    }
}
