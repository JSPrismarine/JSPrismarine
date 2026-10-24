import { Entity } from '../Entity';

export default class TropicalFish extends Entity {
    public static MOB_ID = 'minecraft:tropicalfish';

    public override getType(): string {
        return TropicalFish.MOB_ID;
    }
}
