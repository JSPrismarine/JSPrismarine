import { Entity } from '../Entity';

export default class PiglinBrute extends Entity {
    public static MOB_ID = 'minecraft:piglin_brute';

    public override getType(): string {
        return PiglinBrute.MOB_ID;
    }
}
