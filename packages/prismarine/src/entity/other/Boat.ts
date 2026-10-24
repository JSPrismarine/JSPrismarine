import { Entity } from '../Entity';

export default class Boat extends Entity {
    public static MOB_ID = 'minecraft:boat';

    public override getType(): string {
        return Boat.MOB_ID;
    }
}
