import { Entity } from '../Entity';

export default class ItemFrame extends Entity {
    public static MOB_ID = 'minecraft:frame';

    public override getType(): string {
        return ItemFrame.MOB_ID;
    }
}
