"use strict";

const textFormat = require("./TextFormat.js");

class Logger {
    static log(type_, content) {
	    var time = timestamp("HH:mm");;
        if(type_ == 'info') {
            console.log(`${TextFormat.BLUE()}[INFO: ${time}]${TextFormat.WHITE()} ${content}`);
        } else if(type_ == 'warn') {
            console.log(`${TextFormat.YELLOW()}[WARNING: ${time}]${TextFormat.WHITE()} ${content}`);
        } else if(type_ == 'error') {
            console.log(`${TextFormat.RED()}[ERROR: ${time}]${TextFormat.WHITE()} ${content}`);
        } else if(type_ == 'success') {
            console.log(`${TextFormat.GREEN()}[SUCCESS: ${time}]${TextFormat.WHITE()} ${content}`);
        } else if(type_ == 'emergency') {
            console.log(`${TextFormat.GOLD()}[EMERGENCY: ${time}]${TextFormat.WHITE()} ${content}`);
        } else if(type_ == 'alert') {
            console.log(`${TextFormat.PURPLE()}[ALERT: ${time}]${TextFormat.WHITE()} ${content}`);
        } else if(type_ == 'notice') {
            console.log(`${TextFormat.AQUA()}[NOTICE: ${time}]${TextFormat.WHITE()} ${content}`);
        } else {
            console.log(`${TextFormat.WHITE()}[${time}]${TextFormat.WHITE()} ${content}`);
        }
    }
}

module.exports = Logger;
