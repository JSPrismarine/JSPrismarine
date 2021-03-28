import CommandEnum from './CommandEnum';
import CommandParameter from './CommandParameter';

export default class CommandData {
    public commandName: string = 'commandName';
    public commandDescription: string = 'commandDescription';
    public flags: number = 0;
    public permission: number = 0;
    public aliases: CommandEnum | null = null;
    public overloads: CommandParameter[][] = [];
}
