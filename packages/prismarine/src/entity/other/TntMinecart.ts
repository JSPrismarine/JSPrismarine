import { Entity } from '../Entity';

export default class TntMinecart extends Entity {
    public static MOB_ID = 'minecraft:tnt_minecart';

    public override getType(): string {
        return TntMinecart.MOB_ID;
    }
}
