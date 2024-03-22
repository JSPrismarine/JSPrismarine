import Player from '../Player';

export default interface IForm {
    /**
     * Returns the form in json format.
     */
    jsonSerialize(): string;
    /**
     * Used to call the callback when we recive the response.
     */
    handleResponse(player: Player, data: object): void;
}
