import * as Eris from "eris";
import * as fs from "fs";
import * as mkdirp from "mkdirp";
import { Driver as YgoData } from "ygopro-data";

interface IPermissionMap {
    [guildID: string]: {
        [channelID: string]: string[];
    };
}

export interface ICommandExpose {
    bot: Eris.Client;
    ygo: YgoData;
    commands: Command[];
}

export class Command {
    public names: string[];
    private func: (msg: Eris.Message, data: ICommandExpose) => Promise<void>;
    private condition?: (msg: Eris.Message) => boolean;
    private permPath: string;
    private permissions: IPermissionMap;
    constructor(
        names: string[],
        func: (msg: Eris.Message, data: ICommandExpose) => Promise<void>,
        condition?: (msg: Eris.Message) => boolean
    ) {
        this.names = names;
        this.func = func;
        if (condition) {
            this.condition = condition;
        }
        this.permPath = "./permissions/" + this.names[0] + ".json";
        try {
            this.permissions = require(this.permPath);
        } catch {
            this.permissions = {};
        }
    }

    public execute(msg: Eris.Message, data: ICommandExpose): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.isCanExecute(msg)) {
                this.func(msg, data)
                    .then(() => resolve())
                    .catch(e => reject(e));
            } else {
                reject(new Error("Forbidden"));
            }
        });
    }

    public setPermission(guildID: string, channelID: string, roleID: string): Promise<boolean> {
        return new Promise((resolve, reject) => {
            if (!(guildID in this.permissions)) {
                this.permissions[guildID] = {};
            }
            if (!(channelID in this.permissions[guildID])) {
                this.permissions[guildID][channelID] = [];
            }
            if (this.permissions[guildID][channelID].includes(roleID)) {
                this.permissions[guildID][channelID].splice(this.permissions[guildID][channelID].indexOf(roleID));
                if (!fs.existsSync("./permissions")) {
                    fs.mkdirSync("permissions");
                }
                fs.writeFile(this.permPath, JSON.stringify(this.permissions, null, 4), e => {
                    if (e) {
                        reject(e);
                    } else {
                        resolve(false);
                    }
                });
            } else {
                this.permissions[guildID][channelID].push(roleID);
                if (!fs.existsSync("./permissions")) {
                    fs.mkdirSync("permissions");
                }
                fs.writeFile(this.permPath, JSON.stringify(this.permissions, null, 4), e => {
                    if (e) {
                        reject(e);
                    } else {
                        resolve(true);
                    }
                });
            }
        });
    }

    private checkChannelPermissions(channelID: string, guild: Eris.Guild, rs: string[] | undefined): boolean {
        if (rs && rs.length > 0) {
            // convert list of roleIDs to list of role objects
            const roles = rs.map(id => guild.roles.find(r => r.id === id));
            for (const role of roles) {
                if (this.permissions[guild.id][channelID].includes(role.id) || role.permissions.has("administrator")) {
                    return true;
                }
            }
            return false;
        } else {
            // if the user does not have a role, they cannot be in a role with permission
            return false;
        }
    }

    private checkPermissions(msg: Eris.Message): boolean {
        const channel = msg.channel;
        if (channel instanceof Eris.TextChannel) {
            const guildID = channel.guild.id;
            const channelID = channel.id;
            const roles = msg.member && msg.member.roles;
            if (guildID in this.permissions) {
                if (channelID in this.permissions[guildID]) {
                    return this.checkChannelPermissions(channelID, channel.guild, roles);
                } else if ("default" in this.permissions[guildID]) {
                    // if the guild has permissions, but hasn't specified for this channel, check the defaults
                    return this.checkChannelPermissions("default", channel.guild, roles);
                } else {
                    // if there are no defaults, assume only allowed in explicit channels
                    return false;
                }
            } else {
                // if the guild has specified no permissions, allow everywhere
                return true;
            }
        } else {
            // if it's a DM, the user can go hog wild
            return true;
        }
    }
    private isCanExecute(msg: Eris.Message): boolean {
        return this.checkPermissions(msg) && this.condition ? this.condition(msg) : true;
    }
}