import { Entity } from '../Entity';

export default class Shield extends Entity {
    public static MOB_ID = 'minecraft:shield';

    public override getType(): string {
        return Shield.MOB_ID;
    }
}
