/*import { Message } from "eris";
import { Command } from "../modules/Command";
//import { setLock } from "../modules/trivia";

const names = ["tlock"];
const func = async (msg: Message): Promise<Message> => {
	const result = (await setLock(msg)) ? "allowed" : "forbidden";
	return await msg.channel.createMessage("The Trivia game is now " + result + " in this channel.");
};

const desc = "Toggles whether or not the Trivia game can be played in the channel this command was used in.";

export const command = new Command(names, func, undefined, desc, undefined, true);
*/