import { Message, GuildChannel, Channel } from "eris";
import Jimp from "jimp";
import { Card, Filter } from "ygopro-data";
import { gameData, ignore } from "../bastion";
import { bot } from "./bot";
import { config } from "./configs";
import { data } from "./data";
import { getRandomIntInclusive, trimMsg } from "./util";
import { fs } from "mz";
import { enLangName } from "../config/botOpts.json";

const fixTriviaMessage = (msg: string, lang: string, answer = true): string => {
	if (answer) {
		// convert full width letters to normal (you can type either)
		msg = msg.replace(/[\uff01-\uff5e]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
	}
	if (lang === enLangName) {
		return msg.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
	}
	return (
		msg
			// remove various spacer characters
			.replace(/[:\s\-·∙•‧・･‐‑‒–—―﹘﹣－]/g, "")
			.toLowerCase()
	);
};

async function hardCrop(buffer: Buffer): Promise<Buffer> {
	const image = await Jimp.read(buffer);
	let x;
	let y;
	const w = image.bitmap.width / 2;
	const h = image.bitmap.height / 2;
	switch (getRandomIntInclusive(0, 3)) {
		case 0:
			x = 0;
			y = 0;
			break;
		case 1:
			x = w;
			y = 0;
			break;
		case 2:
			x = 0;
			y = h;
			break;
		default:
			x = w;
			y = h;
	}
	image.crop(x, y, w, h);
	return await image.getBufferAsync(image.getMIME());
}

function getDisplayName(msg: Message, id?: string): string {
	if (id) {
		const channel = msg.channel;
		if (channel instanceof GuildChannel) {
			const member = channel.guild.members.get(id);
			if (member && member.nick) {
				return member.nick;
			}
		}
		const user = bot.users.get(id);
		if (user) {
			return user.username;
		}
		return id;
	}
	if (msg.member && msg.member.nick) {
		return msg.member.nick;
	}
	return msg.author.username;
}

function triviaScore(out: string, msg: Message): string {
	if (Object.keys(gameData[msg.channel.id].score).length > 0) {
		out += "\n**Scores**:\n";
		for (const id in gameData[msg.channel.id].score) {
			out += getDisplayName(msg, id) + ": " + gameData[msg.channel.id].score[id] + "\n";
		}
	}
	return out;
}

// TODO: expose and import IFilterData. any allowed in mean-time
async function startTriviaRound(
	round: number,
	hard: boolean,
	lang: string,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	filterData: any,
	msg: Message
): Promise<void> {
	const channel = msg.channel;
	const triviaTimeLimit = config.getConfig("triviaLimit").getValue(msg);
	const triviaHintTime = config.getConfig("triviaHint").getValue(msg);
	const filter = new Filter(filterData);
	const cardList = await data.getCardList();
	const cards = filter.filter(cardList);
	let targetCard: Card | undefined;
	let image: Buffer | undefined;
	do {
		targetCard = cards[getRandomIntInclusive(0, cards.length - 1)];
		image = await targetCard.image;
	} while (image === undefined || !(lang in targetCard.text));
	const name = targetCard.text[lang].name;
	const fixedName = fixTriviaMessage(name, lang, false);
	let nameIndex = 0;
	// generate a list of hints that aren't auto-include/ignored characters
	const validHints: { [index: number]: string } = {};
	for (const fixedChar of fixedName) {
		const char = name[nameIndex];
		if (fixedChar === char.toLowerCase()) {
			validHints[nameIndex] = char;
			nameIndex++;
		} else {
			while (name[nameIndex].toLowerCase() !== fixedChar && nameIndex < name.length) {
				nameIndex++;
			}
			validHints[nameIndex] = name[nameIndex];
			nameIndex++;
		}
	}
	const numHints = getRandomIntInclusive(Math.ceil(name.length / 4), Math.floor(name.length / 2));
	// remove hints until we've hit the count
	const numRemove = Object.keys(validHints).length - numHints;
	const finalHints = JSON.parse(JSON.stringify(validHints));
	for (let ct = 0; ct < numRemove; ct++) {
		const indexes = Object.keys(finalHints);
		const index = indexes[getRandomIntInclusive(0, indexes.length - 1)];
		delete finalHints[parseInt(index, 10)];
	}
	const hints: string[] = [];
	for (let i = 0; i < name.length; i++) {
		if (i in finalHints) {
			hints.push(finalHints[i]);
		} else if (i in validHints) {
			hints.push("_");
		} else {
			hints.push(name[i]);
		}
	}
	const hint = hints.join(" ");
	if (channel.id in gameData) {
		gameData[channel.id].name = name;
		gameData[channel.id].hint = hint;
		gameData[channel.id].round = round;
		gameData[channel.id].lock = false;
		gameData[channel.id].attempted = false;
	} else {
		gameData[channel.id] = {
			attempted: false,
			filter: filterData,
			game: "trivia",
			hard,
			hint,
			lang,
			lock: false,
			name,
			noAttCount: 0,
			round,
			score: {}
		};
	}
	if (hard) {
		image = await hardCrop(image);
	}
	await channel.createMessage("", { file: image, name: "triviaPic.png" });
	if (!gameData[channel.id]) {
		return;
	}
	const res = await channel.createMessage("Can you name this card? Time remaining: `" + triviaTimeLimit + "`");
	let time = triviaTimeLimit - 5;
	gameData[channel.id].interval = setInterval(() => {
		res.edit("Can you name this card? Time remaining: `" + time + "`");
		time -= 5;
		if (time < 0) {
			clearInterval(gameData[channel.id].interval);
		}
	}, 5000);
	gameData[channel.id].timeoutHint = setTimeout(() => {
		channel.createMessage("Have a hint: `" + gameData[channel.id].hint + "`");
	}, triviaHintTime * 1000);
	let out = "Time's up! The card was **" + gameData[channel.id].name + "**!\n";
	out = triviaScore(out, msg);
	gameData[channel.id].timeoutAnswer = setTimeout(async () => {
		if (gameData[channel.id].lock) {
			return;
		}
		await res.edit("Can you name this card? Time remaining: `0`");
		if (gameData[channel.id].attempted) {
			gameData[channel.id].noAttCount = 0;
		} else {
			gameData[channel.id].noAttCount++;
		}
		clearInterval(gameData[channel.id].interval);
		if (gameData[channel.id].noAttCount >= 3) {
			out += "No attempt was made for 3 rounds! The game is over.";
			await channel.createMessage(out);
			delete gameData[channel.id];
		} else {
			gameData[channel.id].lock = true;
			await channel.createMessage(out);
			await startTriviaRound(
				gameData[channel.id].round,
				gameData[channel.id].hard,
				gameData[channel.id].lang,
				gameData[channel.id].filter,
				msg
			);
		}
	}, triviaTimeLimit * 1000);
}

function triviaWinners(out: string, msg: Message): string {
	if (Object.keys(gameData[msg.channel.id].score).length > 0) {
		let winners: string[] = [];
		for (const id in gameData[msg.channel.id].score) {
			if (winners.length === 0 || gameData[msg.channel.id].score[id] > gameData[msg.channel.id].score[winners[0]]) {
				winners = [id];
			} else if (gameData[msg.channel.id].score[id] === gameData[msg.channel.id].score[winners[0]]) {
				winners.push(id);
			}
		}
		if (winners.length > 1) {
			out += "It was a tie! The winners are " + winners.map(id => getDisplayName(msg, id)).join(", ") + "!";
		} else {
			out += "The winner is " + getDisplayName(msg, winners[0]) + "!";
		}
	}
	return out;
}

export async function answerTrivia(msg: Message): Promise<void> {
	const channel = msg.channel;
	if (!(channel.id in gameData) || gameData[channel.id].game !== "trivia" || gameData[channel.id].lock) {
		return;
	}
	const prefix = config.getConfig("prefix").getValue(msg);
	let out;
	const thumbsup = "👍";
	const fixMes = fixTriviaMessage(msg.content, gameData[channel.id].lang);
	if (
		!fixMes.startsWith(prefix + "tq") &&
		!fixMes.startsWith(prefix + "tskip") &&
		!fixMes.includes(fixTriviaMessage(gameData[channel.id].name, gameData[channel.id].lang))
	) {
		gameData[channel.id].attempted = true;
		return;
	}
	gameData[channel.id].lock = true;
	clearTimeout(gameData[channel.id].timeoutHint);
	clearTimeout(gameData[channel.id].timeoutAnswer);
	clearInterval(gameData[channel.id].interval);
	if (fixMes.startsWith(prefix + "tq")) {
		out = getDisplayName(msg) + " quit the game. The answer was **" + gameData[channel.id].name + "**!\n";
		out = triviaScore(out, msg);
		out = triviaWinners(out, msg);
		await channel.createMessage(out);
		delete gameData[channel.id];
	} else if (fixMes.startsWith(prefix + "tskip")) {
		gameData[channel.id].noAttCount = 0;
		out = getDisplayName(msg) + " skipped the round! The answer was **" + gameData[channel.id].name + "**!\n";
		out = triviaScore(out, msg);
		await channel.createMessage(out);
		await startTriviaRound(
			gameData[channel.id].round,
			gameData[channel.id].hard,
			gameData[channel.id].lang,
			gameData[channel.id].filter,
			msg
		);
	} else if (fixMes.includes(fixTriviaMessage(gameData[channel.id].name, gameData[channel.id].lang))) {
		gameData[channel.id].noAttCount = 0;
		await msg.addReaction(thumbsup).catch(ignore);
		out = getDisplayName(msg) + " got it! The answer was **" + gameData[channel.id].name + "**!\n";
		if (gameData[channel.id].score[msg.author.id]) {
			gameData[channel.id].score[msg.author.id]++;
		} else {
			gameData[channel.id].score[msg.author.id] = 1;
		}
		out = triviaScore(out, msg);
		if (gameData[channel.id].round === 1) {
			out += "The game is over! ";
			out = triviaWinners(out, msg);
			await channel.createMessage(out);
			delete gameData[channel.id];
		} else {
			await channel.createMessage(out);
			startTriviaRound(
				gameData[channel.id].round - 1,
				gameData[channel.id].hard,
				gameData[channel.id].lang,
				gameData[channel.id].filter,
				msg
			);
		}
	}
}

export async function trivia(msg: Message): Promise<void> {
	const channel = msg.channel;
	if (channel.id in gameData) {
		return;
	} else {
		let lang = config.getConfig("defaultLang").getValue(msg);
		let round = 1;
		const content = trimMsg(msg);
		const halves = content.split("|");
		const args = halves[0].split(" ");
		for (const arg of args) {
			if (data.langs.includes(arg)) {
				lang = arg;
			}
			if (parseInt(arg, 10) > round) {
				round = parseInt(arg, 10);
			}
		}
		const maxRound = config.getConfig("triviaMax").getValue(msg);
		round = Math.min(round, maxRound);
		const hard = args.includes("hard");
		let filterContent: string = halves[1];
		if (!filterContent || filterContent.trim().length === 0) {
			filterContent = "ot:ocg/tcg";
		}
		const filter = await Filter.parse(filterContent, lang);
		await startTriviaRound(round, hard, lang, filter, msg);
	}
}

const filePath = "config/tlocks.json";
const triviaLocks: string[] = JSON.parse(fs.readFileSync(filePath, "utf8"));

export async function setLock(c: Channel | Message): Promise<boolean> {
	if (c instanceof Message) {
		c = c.channel;
	}
	const id = c.id;
	const index = triviaLocks.indexOf(id);
	if (index > -1) {
		triviaLocks.splice(index);
		await fs.writeFile(filePath, JSON.stringify(triviaLocks, null, 4));
		return false;
	} else {
		triviaLocks.push(id);
		await fs.writeFile(filePath, JSON.stringify(triviaLocks, null, 4));
		return true;
	}
}

export function getLock(c: Channel | Message): boolean {
	if (c instanceof Message) {
		c = c.channel;
	}
	const id = c.id;
	return triviaLocks.includes(id);
}
