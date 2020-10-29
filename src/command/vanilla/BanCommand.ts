import Player from "../../player/Player";
import Command from "../Command";
import CommandParameter, { CommandParameterType } from "../../network/type/CommandParameter";

export default class BanCommand extends Command {
    constructor() {
        super({
            id: 'minecraft:ban',
            description: 'Ban a player',
            permission: 'minecraft.command.ban'
        } as any);

        this.parameters = [
            new Set()
        ];

        this.parameters[0].add(new CommandParameter({
            name: 'target',
            type: CommandParameterType.Target,
            optional: false
        }));
    }

    execute(sender: Player, args: Array<any>) {
        if (args.length <= 0) {
            sender.sendMessage('§cYou have to specify a target.');
            return;
        } else {
            let target; // TODO: somehow fetch uuid from username
            if ((target = sender.getServer().getPlayerByName(args[0])) === null)
                return sender.sendMessage('§cNo player was found'); // TODO: Chat manager

            sender.getServer().getBanManager().setBanned(target, args.length > 1 ? args.slice(1).join(' ') : undefined);
            target.kick(`You have been banned${args.length > 1 ? ` for reason: ${args.slice(1).join(' ')}` : ''}!`);
        }

        return `Banned ${args[0] || sender.getUsername()} ${args.length > 1 ? `for reason ${args.slice(1).join(' ')}` : ''}`;
    }
}
