import { Entity } from '../Entity';

export default class EyeOfEnderSignal extends Entity {
    public static MOB_ID = 'minecraft:eye_of_ender_signal';

    public override getType(): string {
        return EyeOfEnderSignal.MOB_ID;
    }
}
