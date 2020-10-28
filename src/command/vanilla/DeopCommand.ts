import Player from "../../player/Player";
import Command from "../Command";
import CommandParameter, { CommandParameterType } from "../../network/type/CommandParameter";

export default class DeopCommand extends Command {
    constructor() {
        super({
            id: 'minecraft:deop',
            description: 'Remove player op status',
            permission: 'minecraft.command.op'
        } as any);

        this.parameters = [
            new Set()
        ];

        this.parameters[0].add(new CommandParameter({
            name: 'target',
            type: CommandParameterType.Target,
            optional: true
        }));
    }

    execute(sender: Player, args: Array<any>) {
        if (args.length <= 0) {
            sender.getServer().getPermissionManager().setOp(sender, false);
        } else {
            let target;
            if ((target = sender.getServer().getPlayerByName(args[0])) === null)
                return sender.sendMessage('§cNo player was found'); // TODO: Chat manager

            sender.getServer().getPermissionManager().setOp(target, false);
            target.sendMessage('§eYou are no longer op!'); // TODO: Chat manager
        }

        return `Made ${args[0] || sender.getUsername()} no longer a server operator`;
    }
}
