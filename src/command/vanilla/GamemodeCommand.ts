import CommandParameter, {
    CommandParameterType
} from '../../network/type/CommandParameter';

import Command from '../Command';
import Gamemode from '../../world/Gamemode';
import Player from '../../player/Player';

export default class GamemodeCommand extends Command {
    constructor() {
        super({
            id: 'minecraft:gamemode',
            description: 'Changes gamemode for a player.',
            permission: 'minecraft.command.gamemode'
        } as any);

        this.parameters = [new Set()];

        this.parameters[0].add(
            new CommandParameter({
                name: 'gamemode',
                type: CommandParameterType.String,
                optional: false
            })
        );
        this.parameters[0].add(
            new CommandParameter({
                name: 'target',
                type: CommandParameterType.Target,
                optional: false
            })
        );
    }

    public async execute(sender: Player, args: any[]) {
        if (args.length === 0 || args.length > 2) {
            await sender.sendMessage('§cYou have to specify a gamemode.');
            return;
        }

        let mode;
        switch (args[0]) {
            case 0:
            case 's':
            case 'survival':
                mode = Gamemode.Survival;
                break;
            case 1:
            case 'c':
            case 'creative':
                mode = Gamemode.Creative;
                break;
            case 2:
            case 'adventure':
                mode = Gamemode.Adventure;
                break;
            case 3:
            case 'spectator':
                mode = Gamemode.Spectator;
                break;
            default:
                // TODO: Syntax validation utility class
                await sender.sendMessage('§cIncorrect argument for command');
                return sender.sendMessage(
                    `§7/gamemode §c${args.join(' ')}<--[HERE]`
                );
        }

        let target: Player | null = sender;
        if (args.length > 1 && typeof args[1] === 'string') {
            if ((target = sender.getServer().getPlayerByName(args[1])) === null)
                return sender.sendMessage('§cNo player was found');

            await target.setGamemode(mode);
            if (mode === Gamemode.Creative)
                await target.getConnection().sendCreativeContents();

            await sender.sendMessage(
                `Set ${target.getUsername()}'s game mode to ${Gamemode.getGamemodeName(
                    mode
                )} Mode`
            );
            await target.sendMessage(
                `Your game mode has been updated to ${Gamemode.getGamemodeName(
                    mode
                )} Mode`
            );
            return;
        }

        if (args.length > 1 && typeof args[1] === 'number') {
            return sender.sendMessage('§cNo player was found');
        }

        if (!sender.isPlayer()) {
            return target.sendMessage(
                '§cYou have to run this command in-game!'
            );
        }

        await target.setGamemode(mode);
        if (mode === Gamemode.Creative)
            await target.getConnection().sendCreativeContents();

        return target.sendMessage(
            `Set own game mode to ${Gamemode.getGamemodeName(mode)} Mode`
        );
    }
}
