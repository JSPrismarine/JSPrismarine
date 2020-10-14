import CommandParameter, { CommandParameterType } from "../../network/type/CommandParameter";
import Player from "../../player";
import Command from "../";

export default class TpCommand extends Command {
    constructor() {
        super({ namespace: 'minecraft', name: 'tp', description: 'Teleports a player to a specified location' });

        this.parameters.add(new CommandParameter({
            name: 'target',
            type: CommandParameterType.Target,
            optional: false
        }));
        this.parameters.add(new CommandParameter({
            name: 'message',
            type: CommandParameterType.String,
            optional: true
        }));
    }

    public execute(sender: Player, args: Array<string>): void {
        if (args.length !== 4) {
            return sender.sendMessage('§cYou have to specify <user> x y z.');
        }

        // TODO: handle only supplying x y, and relative teleport
        const target = sender.getServer().getPlayerByName(args[0]);
        if (!target) {
            sender.sendMessage(`§c${args[0]} is not online!`);
            return;
        }

        target.x = args[1];
        target.y = args[2];
        target.z = args[3];
        target.broadcastMove(target);
        sender.sendMessage(`Teleported ${args[0]} to ${target.x} ${target.y} ${target.z}`);
        return;
    }
}
