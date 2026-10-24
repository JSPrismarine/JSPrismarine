import { Entity } from '../Entity';

export default class SkulkerBullet extends Entity {
    public static MOB_ID = 'minecraft:shulker_bullet';

    public override getType(): string {
        return SkulkerBullet.MOB_ID;
    }
}
