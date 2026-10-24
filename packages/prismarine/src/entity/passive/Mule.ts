import { Entity } from '../Entity';

export default class Mule extends Entity {
    public static MOB_ID = 'minecraft:mule';

    public override getType(): string {
        return Mule.MOB_ID;
    }
}
