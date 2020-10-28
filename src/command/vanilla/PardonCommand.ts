import Player from "../../player/Player";
import Command from "../Command";
import CommandParameter, { CommandParameterType } from "../../network/type/CommandParameter";

export default class PardonCommand extends Command {
    constructor() {
        super({
            id: 'minecraft:pardon',
            description: 'Pardon a player',
            permission: 'minecraft.command.pardon'
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
            sender.getServer().getPermissionManager().setUnbanned(args[0]);
        }

        return `Unbanned ${args[0] || sender.getUsername()}`;
    }
}
