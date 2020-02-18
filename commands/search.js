"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const Eris = __importStar(require("eris"));
const ygopro_data_1 = require("ygopro-data");
const Command_1 = require("../modules/Command");
const configs_1 = require("../modules/configs");
const data_1 = require("../modules/data");
const matchPages_1 = require("../modules/matchPages");
const util_1 = require("../modules/util");
const names = ["search", "textsearch"];
async function func(msg, mobile) {
    const content = util_1.trimMsg(msg);
    const a = content.split("|");
    const query = a[0].trim().toLowerCase();
    const filterText = a[1];
    let lang = configs_1.config.getConfig("defaultLang").getValue(msg);
    if (filterText) {
        for (const term of filterText.split(/ +/)) {
            if (data_1.data.langs.includes(term.toLowerCase())) {
                lang = term.toLowerCase();
            }
        }
    }
    let cards = [];
    const fullList = await data_1.data.getCardList();
    for (const code in fullList) {
        const text = fullList[code].text[lang];
        if (text &&
            (text.name.toLowerCase().includes(query) ||
                text.desc.monsterBody.toLowerCase().includes(query) ||
                (text.desc.pendBody && text.desc.pendBody.toLowerCase().includes(query)))) {
            cards.push(fullList[code]);
        }
    }
    if (filterText) {
        const filter = new ygopro_data_1.Filter(await ygopro_data_1.Filter.parse(filterText, lang));
        cards = filter.filter(cards);
    }
    const isDM = msg.channel instanceof Eris.PrivateChannel; // allow anime in DMs because no way to turn it on
    const allowAnime = isDM || configs_1.config.getConfig("allowAnime").getValue(msg);
    const allowCustom = isDM || configs_1.config.getConfig("allowAnime").getValue(msg);
    if (cards.length > 0) {
        if (!allowAnime) {
            cards = cards.filter(c => !(c.data.isOT(ygopro_data_1.enums.ot.OT_ANIME) ||
                c.data.isOT(ygopro_data_1.enums.ot.OT_ILLEGAL) ||
                c.data.isOT(ygopro_data_1.enums.ot.OT_VIDEO_GAME)));
        }
        if (!allowCustom) {
            cards = cards.filter(c => !c.data.isOT(ygopro_data_1.enums.ot.OT_CUSTOM));
        }
        if (cards.length > 0) {
            return await matchPages_1.sendCardList(cards, lang, msg, "Top %s card text matches for `" + query + "`:", mobile);
        }
    }
    return await msg.channel.createMessage("Sorry, I couldn't find any cards matching the text `" + query + "`!");
}
const desc = (prefix) => "Searches for cards by exact match in the card name and/or text, " +
    "and returns a paginated list of all results.\n" +
    `Use arrow reactions or \`${prefix}\`mp<number> to navigate pages.\n` +
    `Use number reactions or \`${prefix}\`md<number> to show the profile for a card.\n` +
    "For details on the filter system, see https://github.com/AlphaKretin/ygo-data/wiki/Filter-system.";
exports.command = new Command_1.Command(names, func, undefined, desc, "query|filter");
//# sourceMappingURL=search.js.map