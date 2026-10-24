import { Entity } from '../Entity';

export default class SkeletonHorse extends Entity {
    public static MOB_ID = 'minecraft:skeleton_horse';

    public override getType(): string {
        return SkeletonHorse.MOB_ID;
    }
}
