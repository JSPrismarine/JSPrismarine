"use strict";

class TextFormat {
    static BOLD() {
        return '\x1b[1m';
    }

    static OBFUSCATED() {
        return '';
    }

	static ITALIC() {
		return '\x1b[3m';
	}

	static UNDERLINE() {
		return '\x1b[4m';
	}


	static STRIKETHROUGH() {
		return '\x1b[9m';
	}

	static RESET() {
		return '\x1b[m';
	}

	static BLACK() {
		return '\x1b[38;5;16m';
	}

	static DARKBLUE() {
		return '\x1b[38;5;19m';
	}

	static DARKGREEN() {
		return '\x1b[38;5;34m';
	}

	static DARKAQUA() {
		return '\x1b[38;5;37m';
	}

	static DARKRED() {
		return '\x1b[38;5;124m';
	}

	static PURPLE() {
		return '\x1b[38;5;127m';
	}

	static GOLD() {
		return '\x1b[38;5;214m';
	}

	static GRAY() {
		return '\x1b[38;5;145m';
	}

	static DARKGRAY() {
		return '\x1b[38;5;59m';
	}

	static BLUE() {
		return '\x1b[38;5;63m';
	}

	static GREEN() {
		return '\x1b[38;5;83m';
	}

	static AQUA() {
		return '\x1b[38;5;87m';
	}

	static RED() {
		return '\x1b[38;5;203m';
	}

	static LIGHTPURPLE() {
		return '\x1b[38;5;207m';
	}

	static YELLOW() {
		return '\x1b[38;5;227m';
	}

	static WHITE() {
		return '\x1b[38;5;231m';
	}
}

module.exports = TextFormat;
