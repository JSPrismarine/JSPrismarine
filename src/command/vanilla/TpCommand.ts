import CommandParameter, { CommandParameterType } from "../../network/type/CommandParameter";
import Player from "../../player/Player";
import Command from "../Command";

export default class TpCommand extends Command {
    constructor() {
        super({
            id: 'minecraft:tp',
            description: 'Teleports a player to a specified location',
            permission: 'minecraft.command.teleport'
        });

        this.parameters = [
            new Set(),
            new Set(),
            new Set(),
            new Set()
        ];

        this.parameters[0].add(new CommandParameter({
            name: 'target',
            type: CommandParameterType.Target,
            optional: false
        }));
        this.parameters[0].add(new CommandParameter({
            name: 'target',
            type: CommandParameterType.Target,
            optional: true
        }));

        this.parameters[1].add(new CommandParameter({
            name: 'target',
            type: CommandParameterType.Target,
            optional: true
        }));
        this.parameters[1].add(new CommandParameter({
            name: 'x',
            type: CommandParameterType.Value,
            optional: true
        }));
        this.parameters[1].add(new CommandParameter({
            name: 'y',
            type: CommandParameterType.Value,
            optional: true
        }));
        this.parameters[1].add(new CommandParameter({
            name: 'z',
            type: CommandParameterType.Value,
            optional: true
        }));

        this.parameters[2].add(new CommandParameter({
            name: 'target',
            type: CommandParameterType.Target,
            optional: true
        }));
        this.parameters[2].add(new CommandParameter({
            name: 'x',
            type: CommandParameterType.Value,
            optional: true
        }));
        this.parameters[2].add(new CommandParameter({
            name: 'z',
            type: CommandParameterType.Value,
            optional: true
        }));

        this.parameters[3].add(new CommandParameter({
            name: 'target',
            type: CommandParameterType.Target,
            optional: true
        }));
        this.parameters[3].add(new CommandParameter({
            name: 'y',
            type: CommandParameterType.Value,
            optional: true
        }));
    }

    public execute(sender: Player, args: Array<string>) {
        // TODO: handle relative cords
        if (args.length <= 1) {
            sender.sendMessage('§cYou have to specify <player> x y z.');
            return;
        }

        // TODO: handle only supplying x y, and relative teleport
        const player = sender.getServer().getPlayerByName(args[0]);
        if (!player) {
            sender.sendMessage(`§c${args[0]} is not online!`);
            return;
        }

        switch (args.length) {
            case 2:
                if (typeof args[1] === 'string') {
                    const target = sender.getServer().getPlayerByName(args[1]);
                    if (!target) {
                        sender.sendMessage(`§c${args[0]} is not online!`);
                        return;
                    }

                    player.setX(target.getX());
                    player.setY(target.getY());
                    player.setZ(target.getZ());
                } else {
                    player.setY(args[1]);
                }
                break;
            case 3:
                if (typeof args[1] === "string" ||
                    typeof args[2] === "string") return
                player.setX(args[1]);
                player.setZ(args[2]);
                break;
            case 4:
                if (typeof args[1] === "string" ||
                    typeof args[2] === "string" ||
                    typeof args[3] === "string") return
                player.setX(args[1]);
                player.setY(args[2]);
                player.setZ(args[3]);
                break;
        }

        player.broadcastMove(player);
        return `Teleported ${args[0]} to ${args.slice(1).join(' ')}`;
    }
}
