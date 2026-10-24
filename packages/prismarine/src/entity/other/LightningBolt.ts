import { Entity } from '../Entity';

export default class LightningBolt extends Entity {
    public static MOB_ID = 'minecraft:lightning_bolt';

    public override getType(): string {
        return LightningBolt.MOB_ID;
    }
}
