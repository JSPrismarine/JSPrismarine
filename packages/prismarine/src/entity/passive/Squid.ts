import { Entity } from '../Entity';

export default class Squid extends Entity {
    public static MOB_ID = 'minecraft:squid';

    public override getType(): string {
        return Squid.MOB_ID;
    }
}
