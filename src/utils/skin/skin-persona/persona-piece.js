'use strict';

class SkinPersonaPiece {

    /** @type {boolean} */
    isDefault
    /** @type {string} */ 
    packId
    /** @type {string} */ 
    pieceId
    /** @type {string} */ 
    pieceType
    /** @type {string} */ 
    productId

    constructor({isDefault, packId, pieceId, pieceType, productId}) {
        this.isDefault = isDefault;
        this.packId = packId;
        this.pieceId = pieceId;
        this.pieceType = pieceType;
        this.productId = productId;
    }
    
}
module.exports = SkinPersonaPiece;