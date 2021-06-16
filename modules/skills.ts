import Fuse from "fuse.js";
import { skills as skillSheets } from "../config/sheetOpts.json";
import { CSVResult } from "./libraryPages";
import fetch from "node-fetch";
import parse from "csv-parse";

interface Skill {
	name: string;
	desc: string;
	chars: string;
}

class Skills {
	private fuseOpts: Fuse.IFuseOptions<Skill> = {
		distance: 100,
		keys: ["name"],
		location: 0,
		minMatchCharLength: 1,
		shouldSort: true,
		threshold: 0.25
	};
	private fuse: Promise<Fuse<Skill>>;
	constructor() {
		this.fuse = this.getFuse();
	}

	public async update(): Promise<void> {
		await (this.fuse = this.getFuse());
	}

	private async extract(url: string): Promise<CSVResult> {
		const file = await fetch(url);
		const csv = await file.text();
		const data = await new Promise<CSVResult>((resolve, reject) => {
			parse(csv, (err, data: CSVResult) => {
				if (err) {
					reject(err);
				} else {
					resolve(data);
				}
			});
		});
		return data;
	}

	private async getFuse(): Promise<Fuse<Skill>> {
		let input: Skill[] = [];
		for(const skillSheet of skillSheets)
		{
			const data = await this.extract(skillSheet);
			const sheet = Object.values(data).filter(s => s.length > 0);
			if (!sheet) {
				throw new Error("Could not load skill sheet!");
			}
			input = input.concat(sheet.map(row => ({ name: row[0], desc: row[1], chars: row[2] })));
		}
		return new Fuse(input, this.fuseOpts);
	}

	public async getSkill(query: string): Promise<Skill | undefined> {
		const results = (await this.fuse).search(query);
		if (results.length < 1) {
			return undefined;
		}
		const result = results[0];
		if ("name" in result) {
			return result.item;
		}
		return result.item;
	}
}

export const skills = new Skills();
