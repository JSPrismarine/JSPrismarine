import { Entity } from '../Entity';

export default class Pufferfish extends Entity {
    public static MOB_ID = 'minecraft:pufferfish';

    public override getType(): string {
        return Pufferfish.MOB_ID;
    }
}
