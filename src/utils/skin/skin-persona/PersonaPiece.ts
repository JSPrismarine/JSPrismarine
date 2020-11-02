interface PersonaPieceData {
    isDefault: boolean;
    packId: string;
    pieceId: string;
    pieceType: string;
    productId: string;
}
class PersonaPiece {
    /** @type {boolean} */
    public isDefault: boolean;
    /** @type {string} */ 
    public packId: string;
    /** @type {string} */ 
    public pieceId: string;
    /** @type {string} */ 
    public pieceType: string;
    /** @type {string} */ 
    public productId: string;

    public constructor(options: PersonaPieceData) {
        this.isDefault = options.isDefault;
        this.packId = options.packId;
        this.pieceId = options.pieceId;
        this.pieceType = options.pieceType;
        this.productId = options.productId;
    }
    
}
export default PersonaPiece;