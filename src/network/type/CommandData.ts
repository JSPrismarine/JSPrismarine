import type CommandParameter from './CommandParameter';

class CommandData {
    public name!: string;
    public description!: string;
    public flags!: number;
    public permission!: number;
    public aliases: any[] = [];
    public parameters: Set<CommandParameter> = new Set()
}
export default CommandData;
