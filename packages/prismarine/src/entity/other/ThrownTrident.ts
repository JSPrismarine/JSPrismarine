import { Entity } from '../Entity';

export default class ThrownTrident extends Entity {
    public static MOB_ID = 'minecraft:thrown_trident';

    public override getType(): string {
        return ThrownTrident.MOB_ID;
    }
}
