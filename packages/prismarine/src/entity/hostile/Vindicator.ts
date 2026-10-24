import { Entity } from '../Entity';

export default class Vindicator extends Entity {
    public static MOB_ID = 'minecraft:vindicator';

    public override getType(): string {
        return Vindicator.MOB_ID;
    }
}
