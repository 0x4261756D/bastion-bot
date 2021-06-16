import { Message } from "eris";
import { strings } from "ygopro-data";
import { Command } from "../modules/Command";
import { getLang } from "../modules/util";
import { config } from "../modules/configs"

const names = ["set", "arch"];
const func = async (msg: Message): Promise<Message | undefined> => {
	const lang = getLang(msg);
	let code = await strings.reverseCode(lang.msg, lang.lang1);
	const tempCode = parseInt(lang.msg, 16);
	if (!isNaN(tempCode) && !code) {
		code = tempCode;
	}
	if (code) {
		const set = await strings.getCode(code, lang.lang2);
		if (set) {
			return await msg.channel.createMessage("`0x" + code.toString(16) + "`: " + set);
		}
		else if(config.getConfig("allowCustom").getValue(msg))
		{
			const set2 = await strings.getCode(code, "cst");
			if(set2)
				return await msg.channel.createMessage("`0x" + code.toString(16) + "`: " + set2);
		}
	}
};

const desc =
	"Searches for an archetype setcode (e.g., Ally of Justice) by name or YGOPro hexadecimal value, and displays both";

export const command = new Command(names, func, undefined, desc, "set");
