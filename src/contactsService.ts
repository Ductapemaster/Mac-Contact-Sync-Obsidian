import VCard from './vcard';
import { IOsaScriptService, OsaScriptService } from './osascriptService';

const vcf = require('vcf');

export interface IContactsService {
    readonly groupName: string;
    readonly enabledContactFields: string;

    loadContacts(): Promise<Map<string, string>>;
    getNumberOfContacts(): Promise<number>;
    getVCards(): Promise<VCard[]>;
}

export class ContactsService implements IContactsService {
	readonly osaScriptService: IOsaScriptService;

    readonly groupName: string;
    readonly enabledContactFields: string;

    readonly GROUP_NOT_DEFINED_ERROR = "GROUP NOT DEFINED";

    constructor(groupName: string, enabledContactFields: string, osaScriptService: IOsaScriptService = new OsaScriptService()) {
		this.groupName = groupName;
        this.enabledContactFields = enabledContactFields;
		this.osaScriptService = osaScriptService;
    }

    async loadContacts(): Promise<Map<string, string>> {
        let vCards: VCard[] = await this.getVCards();
		// Filter out vCards without names
		vCards = vCards.filter((vcard) => {
			return vcard.fn != undefined;
		});

		const filenameToMarkdown = new Map<string, string>();
		for (let vcard of vCards) {
			filenameToMarkdown.set(vcard.getFilename(), vcard.toMarkdown(this.enabledContactFields));
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
