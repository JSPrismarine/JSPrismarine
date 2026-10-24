import { Entity } from '../Entity';

export default class AreaEffectCloud extends Entity {
    public static MOB_ID = 'minecraft:area_effect_cloud';

    public override getType(): string {
        return AreaEffectCloud.MOB_ID;
    }
}
