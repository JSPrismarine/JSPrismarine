import { Entity } from '../Entity';

export default class IceBomb extends Entity {
    public static MOB_ID = 'minecraft:ice_bomb';

    public override getType(): string {
        return IceBomb.MOB_ID;
    }
}
