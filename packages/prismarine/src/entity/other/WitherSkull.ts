import { Entity } from '../Entity';

export default class WitherSkull extends Entity {
    public static MOB_ID = 'minecraft:wither_skull';

    public override getType(): string {
        return WitherSkull.MOB_ID;
    }
}
