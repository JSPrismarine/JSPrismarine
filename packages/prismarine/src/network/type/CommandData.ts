import CommandEnum from './CommandEnum';
import CommandParameter from './CommandParameter';

export default class CommandData {
    public commandName = 'commandName';
    public commandDescription = 'commandDescription';
    public flags = 0;
    public permission = 0;
    public aliases: CommandEnum | null = null;
    public overloads: CommandParameter[][] = [];
}
