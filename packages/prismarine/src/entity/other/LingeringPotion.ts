import { Entity } from '../Entity';

export default class LingeringPotion extends Entity {
    public static MOB_ID = 'minecraft:lingering_potion';

    public override getType(): string {
        return LingeringPotion.MOB_ID;
    }
}
