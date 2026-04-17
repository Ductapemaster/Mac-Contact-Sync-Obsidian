const vcf = require('vcf');

export default class VCard {
	version: string;

	fn?: string;
	nickname?: string;
	emails?: Array<string>;
	title?: string;
	organization?: string;
	//photo?: string;
	telephones?: Array<[string, string]>;
	addresses?: Array<[string, string]>;
	birthdate?: Date;
	URLs?: Array<string>;
	notes?: string;
	xabuid?: string;

	constructor(
		card: typeof vcf
	) {
		this.version = card.version;
		this.fn = card.get("fn")?.valueOf().replace(/\\,/g, ',');
		
		this.nickname = card.get("nickname")?.valueOf() ?? undefined;
		this.organization = this.parseOrganization(card.get("org"));
		this.title = card.get("title")?.valueOf() ?? undefined;
		this.telephones = this.parseTelephones(card.get("tel"));
		this.addresses = this.parseAddresses(card.get("adr"));
		this.emails = this.parseEmails(card.get("email"));
		this.birthdate = this.parseBirthdate(card.get("bday"));
		this.URLs = this.parseURLs(card.get("url"));
		this.notes = this.parseNotes(card.get("note"));
	    this.xabuid = this.parseXAbuid(card.get("xAbuid"));
		//this.photo = card.get("photo")?.valueOf() ?? undefined;
		
		// Inform user of vCard without name
		if (this.fn == undefined) {
			console.debug(`Found vCard without name: \n ${JSON.stringify(this, null, 2)}`);
			//new Notice('Contact without name found. Check developer console for details.')
		}
	}
	
	getFilename(): string {
		return this.fn ?? "NO_NAME";
	}

	toMarkdown(enabledFields: string): string {
		let markdown = `## 👤 ${this.fn}\n\n[Open in Contacts](addressbook://${this.xabuid?.replace(":","%3A")})\n\n`;
		this.getVCardFields().forEach((field) => {
			if (!enabledFields.includes(field)) return;

			markdown += this.fieldToMarkdown(field) ?? '';
		});

		return markdown.trim();
	}

	toFrontmatter(enabledFields: string): Record<string, any> {
		const fm: Record<string, any> = {};

		fm['name'] = this.fn;

		for (const field of this.getVCardFields()) {
			if (!enabledFields.includes(field)) continue;
			if ((this as any)[field] === undefined) continue;

			switch (field) {
				case 'nickname':
					fm['nickname'] = this.nickname;
					break;
				case 'emails':
					fm['email'] = this.emails;
					break;
				case 'title':
					fm['title'] = this.title;
					break;
				case 'organization':
					fm['company'] = this.organization;
					break;
				case 'telephones':
					fm['phone'] = this.telephones?.map(([type, number]) =>
						`${type.split(',')[0]}:${number}`
					);
					break;
				case 'addresses':
					fm['address'] = this.addresses?.map(([type, adr]) => {
						const [, , street, city, , postcode, country] = adr.valueOf().split(';');
						const parts = [street, [postcode, city].filter(Boolean).join(' '), country].filter(Boolean);
						return `${type}:${parts.join(', ')}`;
					});
					break;
				case 'birthdate':
					if (this.birthdate) {
						fm['birthday'] = this.birthdate.toISOString().split('T')[0];
					}
					break;
				case 'URLs':
					fm['url'] = this.URLs;
					break;
				case 'notes':
					fm['notes'] = this.notes?.replace(/\n\t/g, '\n');
					break;
			}
		}

		if (this.xabuid) {
			fm['open'] = `addressbook://${this.xabuid.replace(':', '%3A')}`;
		}

		return fm;
	}

	static defaultBody(): string {
		const fence = '```';
		const script = [
			`const c = dv.current();`,
			``,
			`dv.header(2, "👤 " + (c["name"] ?? dv.current().file.name));`,
			``,
			`if (c["open"]) {`,
			`    dv.paragraph("[Open Contact](" + c["open"] + ")");`,
			`}`,
			``,
			`const items = [];`,
			``,
			`if (c["nickname"]) items.push("Nickname: " + c["nickname"]);`,
			`if (c["company"]) items.push("🏢 Organization: " + c["company"]);`,
			`if (c["title"]) items.push("👔 Title: " + c["title"]);`,
			``,
			`for (const email of (c["email"] ?? [])) {`,
			`    items.push("📧 [" + email + "](mailto:" + email + ")");`,
			`}`,
			``,
			`for (const p of (c["phone"] ?? [])) {`,
			`    const colon = p.indexOf(":");`,
			`    const type = p.substring(0, colon);`,
			`    const number = p.substring(colon + 1);`,
			`    const emoji = type === "cell" ? "📱" : type === "home" ? "🏠" : type === "work" ? "🏢" : "☎️";`,
			`    const clean = number.replace(/\\s/g, "");`,
			`    items.push(emoji + " [" + number + "](tel:" + clean + ")");`,
			`}`,
			``,
			`for (const addr of (c["address"] ?? [])) {`,
			`    const colon = addr.indexOf(":");`,
			`    const type = addr.substring(0, colon);`,
			`    const formatted = addr.substring(colon + 1);`,
			`    const emoji = type === "home" ? "🏠" : type === "work" ? "🏢" : "📍";`,
			`    items.push(emoji + " " + formatted);`,
			`}`,
			``,
			`if (c["birthday"]) {`,
			`    const bday = c["birthday"];`,
			`    const display = bday && typeof bday === "object" && bday.toLocaleString ? bday.toLocaleString() : String(bday);`,
			`    items.push("🎂 Birthday: " + display);`,
			`}`,
			``,
			`for (const url of (c["url"] ?? [])) {`,
			`    items.push("🌐 Website: [" + url + "](" + url + ")");`,
			`}`,
			``,
			`if (c["notes"]) items.push("📝 Notes: " + c["notes"]);`,
			``,
			`if (items.length > 0) dv.list(items);`,
		].join('\n');
		return `${fence}dataviewjs\n${script}\n${fence}`;
	}

	private fieldToMarkdown(field: string): string | undefined {
		if (typeof (this as any)[field] === 'undefined') return undefined;

		switch (field) {
			case 'nickname':
				return `- Nickname: ${this.nickname}\n`;
			case 'notes':
				return `- 📝 Notes: \n\t${this.notes}\n`;
			case 'birthdate':
				return `- 🎂 Birthday: ${this.birthdate?.toLocaleDateString()}\n`;
			case 'organization':
				return `- 🏢 Organization: ${this.organization}\n`;
			case 'title':
				return `- 👔 Title: ${this.title}\n`;
			case 'emails':
				return this.emails?.map((mail) => {
					return `- 📧 [${mail}](mailto:${mail})\n`
				}).join('');
			case 'URLs':
				return this.URLs?.map(URL => {
					return `- 🌐 Website: [${URL}](${URL})\n`;
				}).join('');
			case 'telephones':
				return this.telephones?.map(([type, tel]) => {
					let emotes = ``;
					const types = type.split(',');
					switch (types[0]) {
						case 'cell':
							emotes += '📱';
							break;
						case 'home':
							emotes += '🏠';
							break;
						case 'work':
							emotes += '🏢';
							break;
						default:
							emotes += '☎️';
					}
					switch (types[1]) {
						case 'voice':
							emotes += '📞';
							break;
						case 'fax':
							emotes += '📠';
							break;
						default:
					}
	
					return `- ${emotes} [${tel}](tel:${tel.replace(/\s/g, '')})\n`
				}).join('');
			case 'addresses':
				return this.addresses?.map(([type, adr]) => {
					let emotes = ``;
					switch (type) {
						case 'home':
							emotes += '🏠';
							break;
						case 'work':
							emotes += '🏢';
							break;
						default:
							emotes += '☎️';
					}
	
					let [_, __, street, city, ___, postcode, country] = adr.valueOf().split(';')
	
					return `- ${emotes} ${type} address:\n\t${street}\n\t${postcode} ${city}\n\t${country}\n`
				}).join('');
			
			default:
				console.error(`Error: Unknown field or markdown convertion: ${field}`);
				return undefined;
		}
	}

	private parseBirthdate(bday: typeof vcf.Property): Date | undefined {
		let birthdate: Date | undefined = undefined;
		
		if (bday) {
			birthdate = new Date(Date.parse(bday.valueOf()));
		}
		return birthdate;
	}

	private parseURLs(URLs: typeof vcf.Property): Array<string> | undefined {
		let links: Array<string> | undefined = undefined;
		
		if (URLs) {
			links = new Array<string>();

			if (!Array.isArray(URLs)) {
				URLs = [URLs];
			}
			for (let url of URLs) {
				links.push(url.valueOf());
			}
		}
		return links;
	}

	private parseNotes(notes: typeof vcf.Property): string | undefined {
		let notesString: string | undefined = undefined;
		
		if (notes) {
			notesString = notes.valueOf()?.split('\\n').map((line: string) => line.endsWith('\\') ? line.slice(0, line.length-2) : line).join('\n\t');
		}
		return notesString;
	}

	private parseXAbuid(xabuid: typeof vcf.Property): string | undefined {
		let xabuidString: string | undefined = undefined;
		
		if (xabuid) {
			xabuidString = xabuid.valueOf();
		}
		return xabuidString;
	}

	private parseEmails(email: typeof vcf.Property): Array<string> | undefined {
		let emails: Array<string> | undefined = undefined;
		
		if (email) {
			emails = new Array<string>();
			if (!Array.isArray(email)) {
				email = [email];
			}
			for (let mail of email) {
				emails.push(mail.valueOf());
			}
		}
		return emails;
	}

	private parseAddresses(adr: typeof vcf.Property): Array<[string, string]> | undefined {
		let addresses: Array<[string, string]> | undefined = undefined;
		
		if (adr) {
			addresses = new Array<[string, string]>();
			if (!Array.isArray(adr)) {
				adr = [adr];
			}
			for (let address of adr) {
				let type;
				if (typeof address.type == 'string') 
					type = address.type?.toLowerCase() ?? 'home';
				else if (Array.isArray(address.type))
					type = (address.type?.[0]?.toLowerCase() ?? 'home');
				addresses.push([type, address.valueOf()]);
			}
		}
		return addresses;
	}

	private parseTelephones(tel: typeof vcf.Property): Array<[string, string]> | undefined {
		let telephones: Array<[string, string]> | undefined = undefined;
		
		if (tel) {
			telephones = new Array<[string, string]>();
			if (!Array.isArray(tel)) {
				tel = [tel];
			}
			for (let telephone of tel) {
				let type = (telephone.type?.[0]?.toLowerCase() ?? 'phone') + ',' + (telephone.type?.[1]?.toLowerCase() ?? 'voice');
				telephones.push([type, telephone.valueOf()]);
			}
		}
		return telephones;
	}

	private parseOrganization(org: typeof vcf.Property): string | undefined {
		let organization: string | undefined = undefined;
		
		if (org) {
			organization = org.valueOf().replace(';', ', ').replace(/\\,/g, ',')
		}
		return organization;
	}

	static getVCardFields(): Array<string> {
		const JSON_VCARD = ["vcard",[["version",{},"text","4.0"], ["fn",{},"text","name"]]];
		const inst = new VCard(vcf.fromJSON(JSON_VCARD));
		return inst.getVCardFields();
	}

	getVCardFields(): Array<string> {
		return Object.getOwnPropertyNames(this)
			.filter(prop => (prop !== 'constructor' && typeof (this as any)[prop] !== 'function') && prop !== 'version' && prop !== 'fn');
	}
}
