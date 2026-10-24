import { Entity } from '../Entity';

export default class Endermite extends Entity {
    public static MOB_ID = 'minecraft:endermite';

    public override getType(): string {
        return Endermite.MOB_ID;
    }
}
