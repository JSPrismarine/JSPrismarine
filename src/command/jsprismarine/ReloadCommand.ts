import Command from '../Command';
import Player from '../../player/Player';

export default class ReloadCommand extends Command {
    constructor() {
        super({
            id: 'jsprismarine:reload',
            description: 'Reloads the server.',
            permission: 'jsprismarine.command.reload'
        });
    }

    public execute(sender: Player, args: Array<string>) {
        sender.sendMessage(
            '§cPlease note that this command is not supported and may cause issues when using some plugins.'
        );
        sender.sendMessage(
            '§cIf you encounter any issues please use the /stop command to restart your server.'
        );
        sender
            .getServer()
            .reload()
            .then(() => {
                sender.sendMessage('§aReload complete.');
            });

        return 'Reloaded the server';
    }
}
