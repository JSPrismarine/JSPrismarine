import { Entity } from '../Entity';

export default class ZombiePigman extends Entity {
    public static MOB_ID = 'minecraft:zombie_pigman';

    public override getType(): string {
        return ZombiePigman.MOB_ID;
    }
}
