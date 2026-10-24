import { Entity } from '../Entity';

export default class LeashKnot extends Entity {
    public static MOB_ID = 'minecraft:leash_knot';

    public override getType(): string {
        return LeashKnot.MOB_ID;
    }
}
