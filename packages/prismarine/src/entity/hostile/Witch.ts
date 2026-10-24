import { Entity } from '../Entity';

export default class Witch extends Entity {
    public static MOB_ID = 'minecraft:witch';

    public override getType(): string {
        return Witch.MOB_ID;
    }
}
