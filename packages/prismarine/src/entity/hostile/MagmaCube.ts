import { Entity } from '../Entity';

export default class MagmaCube extends Entity {
    public static MOB_ID = 'minecraft:magma_cube';

    public override getType(): string {
        return MagmaCube.MOB_ID;
    }
}
