import Player from "../../player/player";
import Command from "../Command";

const Gamemode = require('../../world/gamemode');
const CommandParameter = require('../../network/type/command-parameter');

export default class GamemodeCommand extends Command {
    constructor() {
        super({
            namespace: 'minecraft',
            name: 'gamemode',
            description: 'Changes gamemode for a player.'
        } as any);

        this.parameters.add(new CommandParameter({
            name: 'gamemode',
            type: 0x100000 | 0x1d,
            optional: false
        }));
        this.parameters.add(new CommandParameter({
            name: 'target',
            type: 0x100000 | 0x06,
            optional: false
        }));
    }

    /**
     * @param {Player} sender 
     * @param {Array} args
     */
    execute(sender: Player, args: Array<any>) {
        if (args.length < 1 || args.length > 2) {
            return sender.sendMessage('§cYou have to specify a gamemode.');
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
            default:
                return sender.sendMessage('§cInvalid gamemode specified.');
        }

        let target: Player | null = sender;
        if (args.length > 1 && typeof args[1] === 'string') {
            if ((target = sender.getServer().getPlayerByName(args[1])) === null)
                return sender.sendMessage('§cTarget player is not online!');

            target.setGamemode(mode);
            mode === Gamemode.Creative && target.sendCreativeContents();
            return target.sendMessage('Your game mode has been updated to ' + Gamemode.getGamemodeName(mode));
        } else if (args.length > 1 && typeof args[1] === 'number') {
            return sender.sendMessage('§cTarget player is not online!');
        } else {
            if (!(sender instanceof Player)) {
                return target.sendMessage('§cYou have to run this command in-game!');
            }
            target.setGamemode(mode);
            mode === Gamemode.Creative && target.sendCreativeContents();
            return target.sendMessage('Your game mode has been updated to ' + Gamemode.getGamemodeName(mode));
        }
    }
}
