import { Entity } from '../Entity';

export default class Guardian extends Entity {
    public static MOB_ID = 'minecraft:guardian';

    public override getType(): string {
        return Guardian.MOB_ID;
    }
}
