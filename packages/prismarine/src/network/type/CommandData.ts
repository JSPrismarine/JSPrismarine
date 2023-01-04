import CommandEnum from './CommandEnum.js';
import CommandParameter from './CommandParameter.js';

export default class CommandData {
    public commandName = 'commandName.js';
    public commandDescription = 'commandDescription.js';
    public flags = 0;
    public permission = 0;
    public aliases: CommandEnum | null = null;
    public overloads: CommandParameter[][] = [];
}
