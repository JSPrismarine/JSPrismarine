import Command from '../Command';
import type Player from '../../player/Player';
import SetTitlePacket from '../../network/packet/SetTitlePacket';
import { TitleType } from '../../network/type/SetTitleType';

const TitleTypes: any = {
    title: TitleType.SetTitle,
    subtitle: TitleType.SetSubtitle,
    actionbar: TitleType.SetActionBarMessage,
    clear: TitleType.ClearTitle
};

export default class TitleCommand extends Command {
    constructor() {
        // TODO: add permissions to command
        super({
            id: 'minecraft:title',
            description: 'Controls text displayed on the screen.',
            permission: 'minecraft.command.title'
        } as any);
    }

    execute(sender: Player, args: Array<string>): void {
        if (!args[0]) {
            return sender.sendMessage('§cYou have to select a player.');
        }

        if (!Object.keys(TitleTypes).includes(`${args[1]}`.toLowerCase())) {
            return sender.sendMessage(`§cInvalid title type.`);
        }

        if (!args[2] && args[1] != 'clear') {
            return sender.sendMessage('§cPlease specify a message.');
        }

        let targets: Array<Player> = [];

        if (args[0] == '@a') {
            let players = Array.from(
                sender.getServer().getOnlinePlayers().values()
            );
            if (players.length == 0) {
                return sender.sendMessage('§cNo player specified.');
            }
            targets.push(...players);
        } else {
            let player = sender.getServer().getPlayerByName(args[0]);
            if (!player)
                return sender.sendMessage(
                    `§cCan't find the player ${args[0]}.`
                );
            targets.push(player);
        }

        let text = args.slice(2).join(' ');
        for (let i = 0; i < targets.length; i++) {
            let player = targets[i];
            let pk = new SetTitlePacket();
            pk.type = TitleTypes[args[1]];
            if (args[1] != 'clear') {
                pk.text = text;
            }
            player.getPlayerConnection().sendDataPacket(pk);
        }
    }
}
