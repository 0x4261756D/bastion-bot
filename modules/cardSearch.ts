import * as Eris from "eris";
import { Card } from "ygopro-data/dist/Card";
import { data, imageExt } from "./data";

export async function cardSearch(msg: Eris.Message): Promise<void> {
    const baseRegex = /{(.+)}/g;
    const baseResult = baseRegex.exec(msg.content);
    if (baseResult) {
        baseResult.forEach(async (res, i) => {
            // ignore full match
            if (i > 0) {
                const card = await data.getCard(res, "en");
                if (card) {
                    msg.channel.createMessage(generateCardProfile(card));
                }
            }
        });
    }

    const imageRegex = /<(.+)>/g;
    const imageResult = imageRegex.exec(msg.content);
    if (imageResult) {
        imageResult.forEach(async (res, i) => {
            // ignore full match
            if (i > 0) {
                const card = await data.getCard(res, "en");
                if (card) {
                    const image = await card.image;
                    let file: Eris.MessageFile | undefined;
                    if (image) {
                        file = {
                            file: image,
                            name: card.code.toString() + "." + imageExt
                        };
                    }
                    await msg.channel.createMessage("", file);
                    msg.channel.createMessage(generateCardProfile(card, true));
                }
            }
        });
    }

    const mobileRegex = /\[(.+)\]/g;
    const mobileResult = mobileRegex.exec(msg.content);
    if (mobileResult) {
        mobileResult.forEach(async (res, i) => {
            // ignore full match
            if (i > 0) {
                const card = await data.getCard(res, "en");
                if (card) {
                    msg.channel.createMessage(generateCardProfile(card, true));
                }
            }
        });
    }
}

function generateCardProfile(card: Card, mobile: boolean = false): Eris.MessageContent {
    let stats: string = "";
    if (card.setNames.length > 0) {
        stats += "**Archetype**: " + card.setNames.join(", ");
    }
    stats += "\n";
    let type = "**Type**: " + card.typeNames.join("/");
    if (card.raceNames.length > 0) {
        type = type.replace("Monster", card.raceNames.join("|"));
    }
    stats += type;
    if (card.attributeNames.length > 0) {
        stats += " **Attribute**: " + card.attributeNames.join("|");
    }
    stats += "\n";
    if (card.typeNames.includes("Monster")) {
        stats += "**Level**: " + card.level + " **ATK**: " + card.atk + " **DEF**: " + card.def + "\n";
    }

    if (mobile) {
        const outString =
            "__**" + card.name + "**__\n**ID**: " + card.code + "\n" + stats + "**Card Text**:\n" + card.desc_m;
        return outString;
    }
    const outEmbed: Eris.MessageContent = {
        embed: {
            description: stats,
            fields: [
                {
                    name: "Card Text",
                    value: card.desc_m
                }
            ],
            footer: { text: card.code.toString() },
            thumbnail: { url: card.imageLink },
            title: card.name
        }
    };
    return outEmbed;
}
