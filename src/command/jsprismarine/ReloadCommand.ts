import Command from '../Command';
import type CommandExecuter from '../CommandExecuter';

export default class ReloadCommand extends Command {
    public constructor() {
        super({
            id: 'jsprismarine:reload',
            description: 'Reloads the server.',
            permission: 'jsprismarine.command.reload'
        });
        this.api = 'rfc';
    }

    public async dispatch(sender: CommandExecuter, _args: any[]) {
        await sender.sendMessage(
            '§cPlease note that this command is not supported and may cause issues when using some plugins.'
        );
        await sender.sendMessage(
            '§cIf you encounter any issues please use the /stop command to restart your server.'
        );
        await sender.getServer().reload();
        await sender.sendMessage('§aReload complete.');
    }
}
