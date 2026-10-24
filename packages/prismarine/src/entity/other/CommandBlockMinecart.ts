import { Entity } from '../Entity';

export default class CommandBlockMinecart extends Entity {
    public static MOB_ID = 'minecraft:command_block_minecart';

    public override getType(): string {
        return CommandBlockMinecart.MOB_ID;
    }
}
