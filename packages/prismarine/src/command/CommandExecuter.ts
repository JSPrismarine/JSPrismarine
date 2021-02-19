import Server from '../Server';

export default interface CommandExecuter {
    getServer(): Server;
    sendMessage(message: string, xuid?: string, needTranslation?: string): Promise<void>;
    getName(): string;
    getFormattedUsername(): string;
    isPlayer(): boolean;
    isOp(): boolean;
}
