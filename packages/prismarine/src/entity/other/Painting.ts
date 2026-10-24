import { Entity } from '../Entity';

export default class Painting extends Entity {
    public static MOB_ID = 'minecraft:painting';

    public override getType(): string {
        return Painting.MOB_ID;
    }
}
