import Player from "../../player/Player";
import Command from "../Command";

const Gamemode = require('../../world/gamemode');

export default class GamemodeCommand extends Command {
    constructor() {
        super({
            id: 'minecraft:time',
            description: 'Get, set and add to the current time.'
        } as any);
    }

    execute(sender: Player, args: Array<any>) {
        const world = sender?.getWorld?.() || sender.getServer().getWorldManager().getDefaultWorld();

        if (args.length < 1) {
            return sender.sendMessage(`The current time is ${world.getTicks()}`);
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
            }

            return sender.sendMessage(`Set time to: ${world.getTicks()}`);
        }
    }
}
