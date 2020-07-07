'use strict';

const Vector3 = require("./vector3");

class AxisAlignedBB {

    /** @type number */
    minX;
    /** @type number */
    minY;
    /** @type number */
    minZ;
    /** @type number */
    maxX;
    /** @type number */
    maxY;
    /** @type number */
    maxZ;

    /**
     * @param {float} minX
     * @param {float} minY
     * @param {float} minZ
     * @param {float} maxX
     * @param {float} maxY
     * @param {float} maxZ
     */
    constructor(minX, minY, minZ, maxX, maxY, maxZ){
        this.minX = minX;
        this.minY = minY;
        this.minZ = minZ;
        this.maxX = maxX;
        this._maxY = maxY;
        this.maxZ = maxZ
    }

    /**
     * @param {number} x 
     * @param {number} y 
     * @param {number} z 
     */
    expand(x, y, z) {

        this.minX -= x;
        this.minY -= y;
        this.minZ -= z;

        this.maxX += x;
        this.maxY += y;
        this.maxZ += z;


        return this
    }

    /**
     * @param {number} x 
     * @param {number} y 
     * @param {number} z 
     */
    expandedCopy(x, y, z) {
        return (new AxisAlignedBB(this.minX, this.minY, this.minZ, this.maxX, this.maxY, this.maxZ)).expand(x, y, z)
    }

    /**
     * @param {number} x 
     * @param {number} y 
     * @param {number} z 
     */
    shrink(x, y, z) {
        this.minX += x;
        this.minY += y;
        this.minZ += z;

        this.maxX -= x;
        this.maxY -= y;
        this.maxZ -= z;

        return this
    }

    shrinkedCopy(x, y, z){
        return (new AxisAlignedBB(this.minX, this.minY, this.minZ, this.maxX, this.maxY, this.maxZ)).shrink(x, y, z)
    }



    /**
     * @param {Vector3} vector3 
     */
    isVectorInside(vector) {
        if(vector.x <= this.minX || vector3.x >= this.maxX){
            return false
        }

        if(vector.y <= this.minY || vector3.y >= this.maxY){
            return false
        }

        return vector.z > this.minZ && vector.z < this.maxZ
    }
    /**
     * 
     * @param {Vector3} vector 
     */
    isVectorInXY(vector){
        return vector.x >= this.minX && vector.x <= this.maxX && vector.y >= this.minY && vector.y <= this.maxY
    }
    /**
     * 
     * @param {Vector3} vector 
     */
    isVectorInXZ(vector){
        return vector.x >= this.minX && vector.x <= this.maxX && vector.z >= this.minZ && vector.z <= this.maxZ
    }
    /**
     * @param {Vector3} vector 
     */
    isVectorInYZ(vector){
        return vector.y >= this.minY && vector.y <= this.maxY && vector.z >= this.minZ && vector.z <= this.maxZ
    }

    getVolume() {
        return (this.maxX - this.minX) * (this.maxY - this.minY) * (this.maxZ - this.minZ)
    }

    /**
     * 
     * @param {AxisAlignedBB} bb 
     */
    intersectsWith(bb) {
        if(bb.maxX > this.minX && bb.minX < this.maxX){
            if(bb.maxY > this.minY && bb.minY < this.maxY){
                return bb.maxX > this.minZ && bb.minZ < this.maxZ
            }
        }

        return false 
    }

    /**
     * @param {AxisAlignedBB} bb 
     */
    setBB(bb) {
        this.minX = bb.minX
		this.minY = bb.minY
		this.minZ = bb.minZ
		this.maxX = bb.maxX
		this.maxY = bb.maxY
		this.maxZ = bb.maxZ
		
		return this
    }

    toString() {
        //TODO: let herry do this idk how i should make it
    }
}

module.exports = AxisAlignedBB;
