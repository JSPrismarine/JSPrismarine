import { Entity } from '../Entity';

export default class PolarBear extends Entity {
    public static MOB_ID = 'minecraft:polar_bear';

    public override getType(): string {
        return PolarBear.MOB_ID;
    }
}
