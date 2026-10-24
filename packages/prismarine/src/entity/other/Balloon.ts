import { Entity } from '../Entity';

export default class Balloon extends Entity {
    public static MOB_ID = 'minecraft:balloon';

    public override getType(): string {
        return Balloon.MOB_ID;
    }
}
