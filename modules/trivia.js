"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Eris = __importStar(require("eris"));
const jimp_1 = __importDefault(require("jimp"));
const ygopro_data_1 = require("ygopro-data");
const bastion_1 = require("../bastion");
const bot_1 = require("./bot");
const configs_1 = require("./configs");
const data_1 = require("./data");
const util_1 = require("./util");
async function trivia(msg) {
    const channel = msg.channel;
    if (channel.id in bastion_1.gameData) {
        return;
    }
    else {
        let lang = configs_1.config.getConfig("defaultLang").getValue(msg);
        let round = 1;
        const content = util_1.trimMsg(msg);
        const halves = content.split("|");
        const args = halves[0].split(" ");
        for (const arg of args) {
            if (data_1.data.langs.includes(arg)) {
                lang = arg;
            }
            if (parseInt(arg, 10) > round) {
                round = parseInt(arg, 10);
            }
        }
        const hard = args.includes("hard");
        let filterContent = halves[1];
        if (!filterContent || filterContent.trim().length === 0) {
            filterContent = "ot:ocg/tcg";
        }
        const filter = await ygopro_data_1.Filter.parse(filterContent, lang);
        await startTriviaRound(round, hard, lang, filter, msg);
    }
}
exports.trivia = trivia;
const fixTriviaMessage = (msg) => msg
    // convert full width letters to normal (you can type either)
    .replace(/[\uff01-\uff5e]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    // remove various spacer characters
    .replace(/[\s\-·∙•‧・･‐‑‒–—―﹘﹣－]/g, "")
    .toLowerCase();
// TODO: expose and import IFilterData
async function startTriviaRound(round, hard, lang, filterData, msg) {
    const channel = msg.channel;
    const triviaTimeLimit = 30;
    const triviaHintTime = 10;
    const filter = new ygopro_data_1.Filter(filterData);
    const cardList = await data_1.data.getCardList();
    const cards = filter.filter(cardList);
    let targetCard;
    let image;
    do {
        targetCard = cards[util_1.getRandomIntInclusive(0, cards.length - 1)];
        image = await targetCard.image;
    } while (image === undefined || !(lang in targetCard.text));
    const hintIndexes = [];
    const name = targetCard.text[lang].name;
    const numHints = util_1.getRandomIntInclusive(Math.ceil(name.length / 4), Math.floor(name.length / 2));
    const nameArr = name.split("");
    for (let ct = 0; ct < numHints; ct++) {
        let ind;
        do {
            ind = util_1.getRandomIntInclusive(0, name.length - 1);
        } while (hintIndexes.includes(ind) && nameArr[ind] !== " ");
        hintIndexes.push(ind);
    }
    let hint = "";
    for (const index in nameArr) {
        if (nameArr.hasOwnProperty(index)) {
            let letter = nameArr[index];
            if (!hintIndexes.includes(parseInt(index, 10)) && letter !== " ") {
                letter = "_";
            }
            hint += letter + " ";
            nameArr[index] = letter;
        }
    }
    if (channel.id in bastion_1.gameData) {
        bastion_1.gameData[channel.id].name = name;
        bastion_1.gameData[channel.id].hint = hint;
        bastion_1.gameData[channel.id].round = round;
        bastion_1.gameData[channel.id].lock = false;
        bastion_1.gameData[channel.id].attempted = false;
    }
    else {
        bastion_1.gameData[channel.id] = {
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
    if (!bastion_1.gameData[channel.id]) {
        return;
    }
    const res = await channel.createMessage("Can you name this card? Time remaining: `" + triviaTimeLimit + "`");
    let i = triviaTimeLimit - 1;
    bastion_1.gameData[channel.id].IN = setInterval(() => {
        res.edit("Can you name this card? Time remaining: `" + i + "`");
        i--;
    }, 1000);
    bastion_1.gameData[channel.id].TO1 = setTimeout(() => {
        channel.createMessage("Have a hint: `" + bastion_1.gameData[channel.id].hint + "`");
    }, triviaHintTime * 1000);
    let out = "Time's up! The card was **" + bastion_1.gameData[channel.id].name + "**!\n";
    if (Object.keys(bastion_1.gameData[channel.id].score).length > 0) {
        out += "**Scores**:\n";
        for (const id in bastion_1.gameData[channel.id].score) {
            if (bastion_1.gameData[channel.id].score.hasOwnProperty(id)) {
                const user = bot_1.bot.users.get(id);
                const refName = user ? user.username : id;
                out += refName + ": " + bastion_1.gameData[channel.id].score[id] + "\n";
            }
        }
    }
    bastion_1.gameData[channel.id].TO2 = setTimeout(async () => {
        if (bastion_1.gameData[channel.id].lock) {
            return;
        }
        if (bastion_1.gameData[channel.id].attempted) {
            bastion_1.gameData[channel.id].noAttCount = 0;
        }
        else {
            bastion_1.gameData[channel.id].noAttCount++;
        }
        if (bastion_1.gameData[channel.id].IN) {
            clearInterval(bastion_1.gameData[channel.id].IN);
        }
        if (bastion_1.gameData[channel.id].noAttCount >= 3) {
            out += "No attempt was made for 3 rounds! The game is over.";
            await channel.createMessage(out);
            delete bastion_1.gameData[channel.id];
        }
        else {
            bastion_1.gameData[channel.id].lock = true;
            await channel.createMessage(out);
            await startTriviaRound(bastion_1.gameData[channel.id].round, bastion_1.gameData[channel.id].hard, bastion_1.gameData[channel.id].lang, bastion_1.gameData[channel.id].filter, msg);
        }
    }, triviaTimeLimit * 1000);
}
async function hardCrop(buffer) {
    const image = await jimp_1.default.read(buffer);
    let x;
    let y;
    const w = image.bitmap.width / 2;
    const h = image.bitmap.height / 2;
    switch (util_1.getRandomIntInclusive(0, 3)) {
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
    await image.crop(x, y, w, h);
    return await image.getBufferAsync(image.getMIME());
}
function getDisplayName(msg, id) {
    if (id) {
        const channel = msg.channel;
        if (channel instanceof Eris.GuildChannel) {
            const member = channel.guild.members.get(id);
            if (member && member.nick) {
                return member.nick;
            }
        }
        const user = bot_1.bot.users.get(id);
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
async function answerTrivia(msg) {
    const channel = msg.channel;
    if (!(channel.id in bastion_1.gameData) || bastion_1.gameData[channel.id].game !== "trivia" || bastion_1.gameData[channel.id].lock) {
        return;
    }
    const prefix = configs_1.config.getConfig("prefix").getValue(msg);
    let out;
    const thumbsup = "👍";
    const fixMes = fixTriviaMessage(msg.content);
    if (!fixMes.startsWith(prefix + "tq") &&
        !fixMes.startsWith(prefix + "tskip") &&
        !fixMes.includes(fixTriviaMessage(bastion_1.gameData[channel.id].name))) {
        bastion_1.gameData[channel.id].attempted = true;
        return;
    }
    bastion_1.gameData[channel.id].lock = true;
    if (bastion_1.gameData[channel.id].TO1) {
        clearTimeout(bastion_1.gameData[channel.id].TO1);
    }
    if (bastion_1.gameData[channel.id].TO2) {
        clearTimeout(bastion_1.gameData[channel.id].TO2);
    }
    if (bastion_1.gameData[channel.id].IN) {
        clearInterval(bastion_1.gameData[channel.id].IN);
    }
    if (fixMes.startsWith(prefix + "tq")) {
        out = getDisplayName(msg) + " quit the game. The answer was **" + bastion_1.gameData[channel.id].name + "**!\n";
        out = triviaScore(out, msg);
        out = triviaWinners(out, msg);
        await channel.createMessage(out);
        delete bastion_1.gameData[channel.id];
    }
    else if (fixMes.startsWith(prefix + "tskip")) {
        bastion_1.gameData[channel.id].noAttCount = 0;
        out = getDisplayName(msg) + " skipped the round! The answer was **" + bastion_1.gameData[channel.id].name + "**!\n";
        out = triviaScore(out, msg);
        await channel.createMessage(out);
        await startTriviaRound(bastion_1.gameData[channel.id].round, bastion_1.gameData[channel.id].hard, bastion_1.gameData[channel.id].lang, bastion_1.gameData[channel.id].filter, msg);
    }
    else if (fixMes.includes(fixTriviaMessage(bastion_1.gameData[channel.id].name))) {
        bastion_1.gameData[channel.id].noAttCount = 0;
        msg.addReaction(thumbsup);
        out = getDisplayName(msg) + " got it! The answer was **" + bastion_1.gameData[channel.id].name + "**!\n";
        if (bastion_1.gameData[channel.id].score[msg.author.id]) {
            bastion_1.gameData[channel.id].score[msg.author.id]++;
        }
        else {
            bastion_1.gameData[channel.id].score[msg.author.id] = 1;
        }
        out = triviaScore(out, msg);
        if (bastion_1.gameData[channel.id].round === 1) {
            out += "The game is over! ";
            out = triviaWinners(out, msg);
            await channel.createMessage(out);
            delete bastion_1.gameData[channel.id];
        }
        else {
            await channel.createMessage(out);
            startTriviaRound(bastion_1.gameData[channel.id].round - 1, bastion_1.gameData[channel.id].hard, bastion_1.gameData[channel.id].lang, bastion_1.gameData[channel.id].filter, msg);
        }
    }
}
exports.answerTrivia = answerTrivia;
function triviaScore(out, msg) {
    if (Object.keys(bastion_1.gameData[msg.channel.id].score).length > 0) {
        out += "\n**Scores**:\n";
        for (const id in bastion_1.gameData[msg.channel.id].score) {
            if (bastion_1.gameData[msg.channel.id].score.hasOwnProperty(id)) {
                out += getDisplayName(msg, id) + ": " + bastion_1.gameData[msg.channel.id].score[id] + "\n";
            }
        }
    }
    return out;
}
function triviaWinners(out, msg) {
    if (Object.keys(bastion_1.gameData[msg.channel.id].score).length > 0) {
        let winners = [];
        for (const id in bastion_1.gameData[msg.channel.id].score) {
            if (bastion_1.gameData[msg.channel.id].score.hasOwnProperty(id)) {
                if (winners.length === 0 ||
                    bastion_1.gameData[msg.channel.id].score[id] > bastion_1.gameData[msg.channel.id].score[winners[0]]) {
                    winners = [id];
                }
                else if (bastion_1.gameData[msg.channel.id].score[id] === bastion_1.gameData[msg.channel.id].score[winners[0]]) {
                    winners.push(id);
                }
            }
        }
        if (winners.length > 1) {
            out += "It was a tie! The winners are " + winners.map(id => getDisplayName(msg, id)).join(", ") + "!";
        }
        else {
            out += "The winner is " + getDisplayName(msg, winners[0]) + "!";
        }
    }
    return out;
}
//# sourceMappingURL=trivia.js.map