import Command from '../Command';
import CommandParameter from '../../network/type/CommandParameter';
import type Player from '../../player/Player';

export default class KickCommand extends Command {
    constructor() {
        super({
            id: 'minecraft:kick',
            description: 'Kicks a player off the server.',
            permission: 'minecraft.command.kick'
        });

        this.parameters = [new Set()];
        this.parameters[0].add(
            new CommandParameter({
                name: 'target',
                type: 0x100000 | 0x06,
                optional: false
            })
        );
        this.parameters[0].add(
            new CommandParameter({
                name: 'message',
                type: 0x100000 | 0x1d,
                optional: true
            })
        );
    }

    public async execute(
        sender: Player,
        args: string[]
    ): Promise<string | void> {
        if (!args[0]) {
            return sender.sendMessage('§cYou have to specify a player.');
        }

        const reason = args[1]
            ? args.slice(1).join(' ')
            : 'No reason specified.';
        const target = sender.getServer().getPlayerByName(args[0]);

        if (!target) {
            return sender.sendMessage("§cCan't find the selected player.");
        }

        await target.kick(
            'You have been kicked from the server due to: \n\n' + reason
        );
        return `Kicked ${args[0]}`;
    }
}
