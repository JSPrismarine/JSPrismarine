import CommandParameter, {
    CommandParameterType
} from '../../network/type/CommandParameter';

import Command from '../Command';
import CommandExecuter from '../CommandExecuter';
import MovementType from '../../network/type/MovementType';
import Player from '../../player/Player';

export default class TpCommand extends Command {
    constructor() {
        super({
            id: 'minecraft:tp',
            description:
                'Teleports a player to a specified location or another entity.',
            aliases: ['teleport'],
            permission: 'minecraft.command.teleport'
        });

        this.parameters = [
            new Set(),
            new Set(),
            new Set(),
            new Set(),
            new Set(),
            new Set(),
            new Set(),
            new Set()
        ];

        this.parameters[0].add(
            new CommandParameter({
                name: 'target',
                type: CommandParameterType.Target,
                optional: false
            })
        );
        this.parameters[0].add(
            new CommandParameter({
                name: 'target',
                type: CommandParameterType.Target,
                optional: true
            })
        );

        this.parameters[1].add(
            new CommandParameter({
                name: 'target',
                type: CommandParameterType.Target,
                optional: true
            })
        );
        this.parameters[1].add(
            new CommandParameter({
                name: 'x',
                type: CommandParameterType.Value,
                optional: true
            })
        );
        this.parameters[1].add(
            new CommandParameter({
                name: 'y',
                type: CommandParameterType.Value,
                optional: true
            })
        );
        this.parameters[1].add(
            new CommandParameter({
                name: 'z',
                type: CommandParameterType.Value,
                optional: true
            })
        );

        this.parameters[2].add(
            new CommandParameter({
                name: 'target',
                type: CommandParameterType.Target,
                optional: true
            })
        );
        this.parameters[2].add(
            new CommandParameter({
                name: 'x',
                type: CommandParameterType.Value,
                optional: true
            })
        );
        this.parameters[2].add(
            new CommandParameter({
                name: 'z',
                type: CommandParameterType.Value,
                optional: true
            })
        );

        this.parameters[3].add(
            new CommandParameter({
                name: 'target',
                type: CommandParameterType.Target,
                optional: true
            })
        );
        this.parameters[3].add(
            new CommandParameter({
                name: 'y',
                type: CommandParameterType.Value,
                optional: true
            })
        );

        this.parameters[4].add(
            new CommandParameter({
                name: 'player',
                type: CommandParameterType.Target,
                optional: true
            })
        );

        this.parameters[5].add(
            new CommandParameter({
                name: 'x',
                type: CommandParameterType.Value,
                optional: true
            })
        );
        this.parameters[5].add(
            new CommandParameter({
                name: 'y',
                type: CommandParameterType.Value,
                optional: true
            })
        );
        this.parameters[5].add(
            new CommandParameter({
                name: 'z',
                type: CommandParameterType.Value,
                optional: true
            })
        );

        this.parameters[6].add(
            new CommandParameter({
                name: 'x',
                type: CommandParameterType.Value,
                optional: true
            })
        );
        this.parameters[6].add(
            new CommandParameter({
                name: 'z',
                type: CommandParameterType.Value,
                optional: true
            })
        );

        this.parameters[7].add(
            new CommandParameter({
                name: 'y',
                type: CommandParameterType.Value,
                optional: true
            })
        );
    }

    public async execute(
        sender: CommandExecuter,
        args: Array<string | number>
    ) {
        if (args.length === 0) {
            sender.sendMessage('§cYou have to specify <player> x y z.');
            return;
        }

        let player = sender.getServer().getPlayerByName(`${args[0]}`);

        switch (args.length) {
            case 1:
                if (!sender.isPlayer()) {
                    sender.sendMessage(
                        "§cYou can't use this command in the console!"
                    );
                    return;
                }
                if (player) {
                    const target = player;
                    player = sender as Player;

                    player.setX(target.getX());
                    player.setY(target.getY());
                    player.setZ(target.getZ());
                } else if (
                    this.getCoord((sender as Player).getY(), args[0]) ||
                    this.getCoord((sender as Player).getY(), args[0]) === 0
                ) {
                    if (!sender.isPlayer()) {
                        sender.sendMessage(
                            "§cYou can't use this command in the console!"
                        );
                        return;
                    }

                    player = sender as Player;

                    player.setY(
                        this.getCoord((sender as Player).getZ(), args[0])
                    );
                } else {
                    sender.sendMessage(`§c${args[0]} is not online!`);
                    return;
                }

                break;
            case 2:
                if (
                    (this.getCoord((sender as Player).getX(), args[0]) ||
                        this.getCoord((sender as Player).getX(), args[0]) ===
                            0) &&
                    (this.getCoord((sender as Player).getZ(), args[1]) ||
                        this.getCoord((sender as Player).getZ(), args[1]))
                ) {
                    if (!sender.isPlayer()) {
                        sender.sendMessage(
                            "§cYou can't use this command in the console!"
                        );
                        return;
                    }

                    player = sender as Player;

                    player.setX(
                        this.getCoord((sender as Player).getX(), args[0])
                    );
                    player.setZ(
                        this.getCoord((sender as Player).getZ(), args[1])
                    );
                } else if (
                    player &&
                    (this.getCoord(player.getY(), args[1]) ||
                        this.getCoord(player.getY(), args[1]) === 0)
                ) {
                    player.setY(this.getCoord(player.getY(), args[1]));
                } else if (player) {
                    const target = sender
                        .getServer()
                        .getPlayerByName(`${args[1]}`);
                    if (!target) {
                        sender.sendMessage(`§c${args[0]} is not online!`);
                        return;
                    }

                    player.setX(target.getX());
                    player.setY(target.getY());
                    player.setZ(target.getZ());
                } else if (!player) {
                    sender.sendMessage(`§c${args[0]} is not online!`);
                    return;
                } else {
                    sender.sendMessage(
                        '§cYou have to specify /tp <player> <player>.'
                    );
                    return;
                }

                break;
            case 3:
                if (
                    (this.getCoord((sender as Player).getX(), args[0]) ||
                        this.getCoord((sender as Player).getX(), args[0]) ===
                            0) &&
                    (this.getCoord((sender as Player).getY(), args[1]) ||
                        this.getCoord((sender as Player).getY(), args[1]) ===
                            0) &&
                    (this.getCoord((sender as Player).getZ(), args[2]) ||
                        this.getCoord((sender as Player).getZ(), args[2]) === 0)
                ) {
                    if (!sender.isPlayer()) {
                        sender.sendMessage(
                            "§cYou can't use this command in the console!"
                        );
                        return;
                    }

                    player = sender as Player;

                    player.setX(
                        this.getCoord((sender as Player).getX(), args[0])
                    );
                    player.setY(
                        this.getCoord((sender as Player).getY(), args[1])
                    );
                    player.setZ(
                        this.getCoord((sender as Player).getZ(), args[2])
                    );
                } else if (
                    player &&
                    (this.getCoord(player.getX(), args[1]) ||
                        this.getCoord(player.getX(), args[1]) === 0) &&
                    (this.getCoord(player.getZ(), args[2]) ||
                        this.getCoord(player.getZ(), args[2]) === 0)
                ) {
                    player.setX(this.getCoord(player.getX(), args[1]));
                    player.setZ(this.getCoord(player.getZ(), args[2]));
                } else if (!player) {
                    sender.sendMessage(`§c${args[0]} is not online!`);
                    return;
                } else {
                    sender.sendMessage(
                        '§cYou have to specify /tp <player> x z.'
                    );
                    return;
                }

                break;
            case 4:
                if (
                    player &&
                    (this.getCoord(player.getX(), args[1]) ||
                        this.getCoord(player.getX(), args[1]) === 0) &&
                    (this.getCoord(player.getY(), args[2]) ||
                        this.getCoord(player.getY(), args[2]) === 0) &&
                    (this.getCoord(player.getZ(), args[3]) ||
                        this.getCoord(player.getZ(), args[3]) === 0)
                ) {
                    player.setX(this.getCoord(player.getX(), args[1]));
                    player.setY(this.getCoord(player.getY(), args[2]));
                    player.setZ(this.getCoord(player.getZ(), args[3]));
                } else if (!player) {
                    sender.sendMessage(
                        '§cYou have to specify /tp <player> x z.'
                    );
                    return;
                } else {
                    sender.sendMessage('§cYou have to specify <player> x y z.');
                    return;
                }

                break;
            default:
                sender.sendMessage('$cYou passed to many arguments!');
                return;
        }

        if (!player) {
            sender.sendMessage(`§c${args[0]} is not online!`);
            return;
        }

        await player
            .getConnection()
            .broadcastMove(player, MovementType.Teleport);
        return `Teleported ${player.getUsername()} to ${player.getX()} ${player.getY()} ${player.getZ()}`;
    }

    private getCoord(
        oldCord: number,
        newCord: number | string
    ): number | undefined {
        if (typeof newCord === 'string' && newCord === '~') return oldCord;
        if (
            typeof newCord === 'string' &&
            newCord.startsWith('~') &&
            Number(newCord.slice(1))
        ) {
            return oldCord + Number(newCord.slice(1));
        }

        if (typeof newCord === 'number') {
            return newCord;
        }
    }
}
