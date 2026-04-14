import VCard from './vcard';
import { IOsaScriptService, OsaScriptService } from './osascriptService';

const vcf = require('vcf');

export interface ContactEntry {
	markdown: string;
	originalFilename: string;
}

export interface IContactsService {
    readonly groupName: string;
    readonly enabledContactFields: string;
    readonly normalizeDiacritics: boolean;

    loadContacts(): Promise<Map<string, ContactEntry>>;
    getNumberOfContacts(): Promise<number>;
    getVCards(): Promise<VCard[]>;
}

export function stripDiacritics(str: string): string {
	return str
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[\xF8\xD8]/g, (c) => c === '\xF8' ? 'o' : 'O')
		.replace(/[\xE6\xC6]/g, (c) => c === '\xE6' ? 'ae' : 'Ae')
		.replace(/[\xF0\xD0]/g, (c) => c === '\xF0' ? 'd' : 'D')
		.replace(/[\xFE\xDE]/g, (c) => c === '\xFE' ? 'th' : 'Th')
		.replace(/\xDF/g, 'ss')
		.replace(/[\u0141\u0142]/g, (c) => c === '\u0142' ? 'l' : 'L');
}

export class ContactsService implements IContactsService {
	readonly osaScriptService: IOsaScriptService;

    readonly groupName: string;
    readonly enabledContactFields: string;
    readonly normalizeDiacritics: boolean;

    readonly GROUP_NOT_DEFINED_ERROR = "GROUP NOT DEFINED";

    constructor(groupName: string, enabledContactFields: string, normalizeDiacritics: boolean, osaScriptService: IOsaScriptService = new OsaScriptService()) {
		this.groupName = groupName;
        this.enabledContactFields = enabledContactFields;
        this.normalizeDiacritics = normalizeDiacritics;
		this.osaScriptService = osaScriptService;
    }

    async loadContacts(): Promise<Map<string, ContactEntry>> {
        let vCards: VCard[] = await this.getVCards();
		// Filter out vCards without names
		vCards = vCards.filter((vcard) => {
			return vcard.fn != undefined;
		});

		const filenameToMarkdown = new Map<string, ContactEntry>();
		for (let vcard of vCards) {
			const originalFilename = vcard.getFilename();
			const filename = this.normalizeDiacritics ? stripDiacritics(originalFilename) : originalFilename;
			filenameToMarkdown.set(filename, { markdown: vcard.toMarkdown(this.enabledContactFields), originalFilename });
		}
		return filenameToMarkdown;
    }

    async getNumberOfContacts(): Promise<number> {
        const APPLESCRIPT = `
tell application "Contacts"
	try
		set targetGroup to group "${this.groupName}"
		count of people in targetGroup
	on error
		error "${this.GROUP_NOT_DEFINED_ERROR}"
	end try
end tell
`;

		let resultPromise = this.osaScriptService.executeScript(APPLESCRIPT).then<number>((resultStr) => {
			let resultInt = parseInt(resultStr);
			if (isNaN(resultInt)) {
				throw new Error(`Non-numeric result from AppleScript: ${resultStr}`);
			}
			return resultInt;
		})

		return await resultPromise;
	}

    async getVCards(): Promise<VCard[]> {
		const APPLESCRIPT = `
tell application "Contacts"
	try
		set targetGroup to group "${this.groupName}"
		set vcardData to ""
		repeat with eachPerson in people of targetGroup
			set vcardData to vcardData & vcard of eachPerson & return
		end repeat
		return vcardData
	on error
		error "${this.GROUP_NOT_DEFINED_ERROR}"
	end try
end tell
`;
		const vCardRegex = /BEGIN:VCARD[\s\S]*?END:VCARD/g;

		let resultPromise = this.osaScriptService.executeScript(APPLESCRIPT).then<VCard[]>((vCardStr) => {
			let matches = vCardStr.match(vCardRegex);

			let vCards: VCard[] = [];
			for (let match of matches ?? []) {
				const card = new vcf().parse(match);
				const vCardObj = new VCard(card);
				vCards.push(vCardObj);
			}

			return vCards;
		});

		return await resultPromise;
    }
}
