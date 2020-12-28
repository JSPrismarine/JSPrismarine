import Command from '../Command';
import Player from '../../player/Player';

export default class GamemodeCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:time',
            description: 'Get, set and add to the current time.',
            permission: 'minecraft.command.time'
        } as any);
    }

    public async execute(sender: Player, args: any[]) {
        const world =
            sender?.getWorld?.() ||
            sender.getServer().getWorldManager().getDefaultWorld();

        if (args.length === 0) {
            return sender.sendMessage(
                `The current time is ${world.getTicks()}`
            );
        }

        if (args.length === 2 && typeof args[1] === 'number') {
            switch (args[0].toLowerCase()) {
                case 'set':
                    world.setTicks(args[1]);
                    break;
                case 'add':
                    world.setTicks(world.getTicks() + args[1]);
                    break;
                case 'sub':
                    world.setTicks(world.getTicks() - args[1]);
                    break;
                default:
                    throw new Error(`Invalid argument "${args[0]}"`);
            }

            await world.sendTime();
            await sender.sendMessage(`Set time to: ${world.getTicks()}`);
        }
    }
}
