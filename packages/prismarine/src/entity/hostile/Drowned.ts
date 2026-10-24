import { Entity } from '../Entity';

export default class Drowned extends Entity {
    public static MOB_ID = 'minecraft:drowned';

    public override getType(): string {
        return Drowned.MOB_ID;
    }
}
