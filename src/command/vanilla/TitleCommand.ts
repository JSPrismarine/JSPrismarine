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
        super({
            id: 'minecraft:title',
            description: 'Controls text displayed on the screen.',
            permission: 'minecraft.command.title'
        } as any);
    }

    public async execute(
        sender: Player,
        args: Array<string | number>
    ): Promise<void> {
        if (!args[0])
            return sender.sendMessage('§cYou have to select a player.');

        if (!Object.keys(TitleTypes).includes(`${args[1]}`.toLowerCase()))
            return sender.sendMessage(`§cInvalid title type.`);

        if (!args[2] && args[1] !== 'clear')
            return sender.sendMessage('§cPlease specify a message.');

        const targets: Player[] = [];
        if (args[0] === '@a') {
            const players = Array.from(
                sender.getServer().getOnlinePlayers().values()
            );
            if (players.length === 0) {
                return sender.sendMessage('§cNo player specified.');
            }

            targets.push(...players);
        } else {
            const player = sender.getServer().getPlayerByName(`${args[0]}`);
            if (!player)
                return sender.sendMessage(
                    `§cCan't find the player ${args[0]}.`
                );
            targets.push(player);
        }

        const text = args.slice(2).join(' ');
        for (const player of targets) {
            const pk = new SetTitlePacket();
            pk.type = TitleTypes[args[1]];

            if (args[1] !== 'clear') {
                pk.text = text;
            }

            await player.getConnection().sendDataPacket(pk);
        }
    }
}
