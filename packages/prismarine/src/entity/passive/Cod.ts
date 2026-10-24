import { Entity } from '../Entity';

export default class Cod extends Entity {
    public static MOB_ID = 'minecraft:cod';

    public override getType(): string {
        return Cod.MOB_ID;
    }
}
