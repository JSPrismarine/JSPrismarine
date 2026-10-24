import { Entity } from '../Entity';

export default class WitherSkullDangerous extends Entity {
    public static MOB_ID = 'minecraft:wither_skull_dangerous';

    public override getType(): string {
        return WitherSkullDangerous.MOB_ID;
    }
}
