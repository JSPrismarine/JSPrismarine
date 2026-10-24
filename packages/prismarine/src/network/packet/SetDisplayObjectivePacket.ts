import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * Registers a scoreboard objective and places it in one of the client's display slots.
 *
 * The slot names vanilla uses are `list`, `sidebar` and `belowname`. Scores for the objective
 * arrive afterwards in `SetScorePacket`, keyed by the Objective Name set here.
 *
 * **Bound To:** Client
 *
 * Wire layout at protocol 2193: DisplaySlotName, ObjectiveName, ObjectiveDisplayName and
 * CriteriaName as strings, then SortOrder as a ZigZag varint32.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.50/packets/set-display-objective-packet/
 */
export default class SetDisplayObjectivePacket extends DataPacket {
    public static NetID = Identifiers.SetDisplayObjectivePacket;

    /** Where the objective is shown: `list`, `sidebar` or `belowname`. */
    public displaySlotName = '';

    /** Name the scores refer to the objective by. */
    public objectiveName = '';

    /** Title shown above the objective. */
    public objectiveDisplayName = '';

    /** Always `dummy` in vanilla; the client tracks no criteria itself. */
    public criteriaName = 'dummy';

    /** 0 sorts ascending by score, 1 descending. */
    public sortOrder = 0;

    /** Reads the slot, the two names, the criteria and the sort order. */
    public decodePayload(): void {
        this.displaySlotName = NetworkUtil.readString(this);
        this.objectiveName = NetworkUtil.readString(this);
        this.objectiveDisplayName = NetworkUtil.readString(this);
        this.criteriaName = NetworkUtil.readString(this);
        this.sortOrder = this.readVarInt();
    }

    /** Writes the slot, the two names, the criteria and the sort order. */
    public encodePayload(): void {
        NetworkUtil.writeString(this, this.displaySlotName);
        NetworkUtil.writeString(this, this.objectiveName);
        NetworkUtil.writeString(this, this.objectiveDisplayName);
        NetworkUtil.writeString(this, this.criteriaName);
        this.writeVarInt(this.sortOrder);
    }
}
