/* eslint-disable promise/prefer-await-to-then */
import Command from '../Command';
import OnlinePlayerArgument from '../argument/OnlinePlayerArgument';
import TextArgument from '../argument/TextArgument';
import CommandExecuter from '../CommandExecuter';

export default class BanCommand extends Command {
    public constructor() {
        super({
            id: 'minecraft:ban',
            description: 'Ban a player.',
            permission: 'minecraft.command.ban'
        });
        this.api = 'rfc';
        this.arguments.add(0, new OnlinePlayerArgument());
        this.arguments.add(1, new TextArgument('reason', true));
    }

    public async dispatch(sender: CommandExecuter, args: any[]) {
        if (!args[0]) {
            return sender.sendMessage(`§cCould not find a user with given name.`);
        }

        const reason: string = args[1] || "No reason provided."

        await args[0].kick(`You have been banned from the server due to: \n\n${reason}`);
        await sender.getServer().getBanManager().setBanned(args[0].getName());

        return sender.sendMessage(`Banned ${args[0].getName()} due to: ${reason}`);
    }
}