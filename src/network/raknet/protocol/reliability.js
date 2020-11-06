'use strict';

// http://www.jenkinssoftware.com/raknet/manual/reliabilitytypes.html
// Used to recognize packet reliability and know what to write in buffer
const Reliability = {
    Unreliable: 0,
    UnreliableSequenced: 1,
    Reliable: 2,
    ReliableOrdered: 3,
    ReliableSequenced: 4,
    UnreliableWithAckReceipt: 5,
    ReliableWithAckReceipt: 6,
    ReliableOrderedWithAckReceipt: 7,

    reliable: function (reliability) {
        switch (reliability) {
            case this.Reliable:
            case this.ReliableOrdered:
            case this.ReliableSequenced:
                return true;
            default:
                return false;
        }
    },

    sequencedOrOrdered: function (reliability) {
        switch (reliability) {
            case this.UnreliableSequenced:
            case this.ReliableOrdered:
            case this.ReliableSequenced:
                return true;
            default:
                return false;
        }
    },

    sequenced: function (reliability) {
        switch (reliability) {
            case this.UnreliableSequenced:
            case this.ReliableSequenced:
                return true;
            default:
                return false;
        }
    }
};
module.exports = Reliability;
