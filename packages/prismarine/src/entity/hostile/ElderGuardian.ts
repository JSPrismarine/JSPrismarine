import { Entity } from '../Entity';

export default class ElderGuardian extends Entity {
    public static MOB_ID = 'minecraft:elder_guardian';

    public override getType(): string {
        return ElderGuardian.MOB_ID;
    }
}
