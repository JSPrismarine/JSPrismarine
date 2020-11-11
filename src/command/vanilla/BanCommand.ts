import Player from '../../player/Player';
import Command from '../Command';
import CommandParameter, {
    CommandParameterType
} from '../../network/type/CommandParameter';

export default class BanCommand extends Command {
    constructor() {
        super({
            id: 'minecraft:ban',
            description: 'Ban a player',
            permission: 'minecraft.command.ban'
        } as any);

        this.parameters = [new Set()];

        this.parameters[0].add(
            new CommandParameter({
                name: 'target',
                type: CommandParameterType.Target,
                optional: false
            })
        );
    }

    execute(sender: Player, args: Array<any>) {
        if (args.length <= 0) {
            sender.sendMessage('§cYou have to specify a target.');
            return;
        } else {
            const target = sender.getServer().getPlayerByName(args[0]);

            sender
                .getServer()
                .getBanManager()
                .setBanned(
                    args[0],
                    args.length > 1 ? args.slice(1).join(' ') : undefined
                );

            if (target)
                target.kick(
                    `You have been banned${
                        args.length > 1
                            ? ` for reason: ${args.slice(1).join(' ')}`
                            : ''
                    }!`
                );
        }

        return `Banned ${args[0] || sender.getUsername()} ${
            args.length > 1 ? `for reason ${args.slice(1).join(' ')}` : ''
        }`;
    }
}
