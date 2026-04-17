import { App, Notice, Platform, Plugin, PluginSettingTab, Setting, TFile, TFolder, normalizePath } from 'obsidian';
import VCard from './vcard';
import { IContactsService, ContactsService, alternateFilename } from './contactsService';
import { FileService, IFileService } from './fileService';

interface ContactsPluginSettings {
	contactsGroup: string;
	contactsFolder: string;
	contactTemplatePath: string;
	enabledContactFields: string;
	normalizeDiacritics: boolean;
}

class SettingTab extends PluginSettingTab {
	plugin: ContactsPlugin;

	constructor(app: App, plugin: ContactsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Contacts folder')
			.setDesc('Select the folder in which your contacts will stored')
			.addText(text => text
				.setPlaceholder('Contacts')
				.setValue(this.plugin.settings.contactsFolder)
				.onChange(async (value) => {
					this.plugin.settings.contactsFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Contacts group')
			.setDesc('Enter the name of the group ("Smart List") in which your contacts are stored in the MacOS Contacts app')
			.addText(text => text
				.setPlaceholder('Obsidian')
				.setValue(this.plugin.settings.contactsGroup)
				.onChange(async (value) => {
					this.plugin.settings.contactsGroup = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Normalize diacritics in filenames')
			.setDesc('Strip accents and diacritical marks from contact names when generating file names (e.g. Østen → Osten). When toggled, existing contact files will be renamed automatically on the next sync.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.normalizeDiacritics)
				.onChange(async (value) => {
					this.plugin.settings.normalizeDiacritics = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Contact note template')
			.setDesc('Path to a template file used when creating new contact notes (e.g. Templates/Contact.md). The template body is copied as-is; any existing frontmatter in the template is ignored. Requires the Dataview community plugin. Leave blank to use the built-in default.')
			.addText(text => text
				.setPlaceholder('Templates/Contact.md')
				.setValue(this.plugin.settings.contactTemplatePath)
				.onChange(async (value) => {
					this.plugin.settings.contactTemplatePath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Configure the shown contact fields below')
			.setDesc('To update the shown contact fields, re-sync your contacts')

		for (let attribute of VCard.getVCardFields()) {
			new Setting(containerEl)
				.setName(`${attribute}`)
				.addToggle((toggle) => {
					toggle.setValue(this.plugin.settings.enabledContactFields.includes(attribute))
					toggle.onChange(async (value) => {
						this.plugin.settings.enabledContactFields = this.toggleEnabledField(attribute, value);
						await this.plugin.saveSettings();
					});
				});
		}
	}

	toggleEnabledField(field: string, value: boolean): string {
		let enabledFields = this.plugin.settings.enabledContactFields.split(',');
		if (value) {
			enabledFields.push(field);
		} else {
			enabledFields = enabledFields.filter((enabledField) => enabledField != field);
		}
		return enabledFields.join(',');
	}
}

const DEFAULT_SETTINGS: ContactsPluginSettings = {
	contactsGroup: 'Obsidian',
	contactsFolder: 'Contacts',
	contactTemplatePath: '',
	enabledContactFields: 'nickname,emails,title,organization,telephones,addresses,birthdate,URLs,notes',
	normalizeDiacritics: false
}

export default class ContactsPlugin extends Plugin {
	settings: ContactsPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'sync-contacts',
			name: 'Sync contacts',
			callback: async () =>  {
				if (!Platform.isMacOS)
					return new Notice("Error: This plugin only works on MacOS");

				new Notice('Syncing...')

				let loadContactsLogic: IContactsService = new ContactsService(this.settings.contactsGroup, this.settings.enabledContactFields, this.settings.normalizeDiacritics)
				let numContactsPromise = loadContactsLogic.getNumberOfContacts().then((numContacts) => {
					new Notice(`Found ${numContacts} Contacts in group ${this.settings.contactsGroup}`)
					return numContacts
				})

				let fileService: IFileService = new FileService();
				let createFolderPromise = fileService.createFolder(this.settings.contactsFolder, this.app)

				let [numContacts, _] = await Promise.all([numContactsPromise, createFolderPromise])

				// Resolve the body for new contact notes (template or built-in default)
				const newContactBody = await this.resolveNewContactBody();

				// Load contacts from MacOS "Contacts" and save to files
				let contactResults = await loadContactsLogic.loadContacts();
				let successfulContacts = 0
				let renamedContacts = 0
				let promises: Array<Promise<any>> = [];
				for (let [filename, entry] of contactResults) {
					let filePath = normalizePath(`${this.settings.contactsFolder}/${filename}.md`);
					let file = this.app.vault.getAbstractFileByPath(filePath);

					// If the target file doesn't exist, check whether it exists under the alternate
					// name (i.e. the name it would have under the opposite normalization setting).
					if (file === null) {
						const altName = alternateFilename(filename, entry);
						if (altName !== null) {
							const altFilePath = normalizePath(`${this.settings.contactsFolder}/${altName}.md`);
							const altFile = this.app.vault.getAbstractFileByPath(altFilePath);
							if (altFile instanceof TFile) {
								promises.push(
									this.app.fileManager.renameFile(altFile, filePath)
										.then(() => {
											const renamedFile = this.app.vault.getAbstractFileByPath(filePath);
											if (renamedFile instanceof TFile)
												return fileService.updateFile(renamedFile, entry.frontmatter, this.app);
										})
										.then(() => { renamedContacts++; successfulContacts++; })
										.catch((error) => console.error(`Error renaming/syncing ${filename}\n${error}`))
								);
								continue;
							}
						}
					}

					if (file instanceof TFolder) {
						console.error(`Error: ${filePath} is a folder`);
						new Notice(`Error: ${filePath} is a folder`);
					} else if (file === null) {
						promises.push(
							fileService.saveFile(filePath, entry.frontmatter, newContactBody, this.app)
								.then((_) => successfulContacts++)
								.catch((error) => console.error(`Error syncing ${filename}\n${error}`))
						);
					} else if (file instanceof TFile) {
						promises.push(
							fileService.updateFile(file, entry.frontmatter, this.app)
							.then((_) => successfulContacts++)
							.catch((error) => console.error(`Error syncing ${filename}\n${error}`))
						);
					}
				}

				await Promise.all(promises)
				.catch((error) => {
					new Notice("Error syncing contacts!");
					console.error(error);
				}).finally(() => {
					const renameInfo = renamedContacts > 0 ? ` (${renamedContacts} renamed)` : '';
					new Notice(`Successfully synced ${successfulContacts} of ${numContacts} Contacts${renameInfo}`)
					console.info(`Successfully synced ${successfulContacts} of ${numContacts} Contacts${renameInfo}`)
				});
			}
		});

		this.addSettingTab(new SettingTab(this.app, this));
	}

	/**
	 * Returns the body to use when creating a new contact note.
	 * If a template path is configured and the file exists, its body (frontmatter
	 * stripped) is used. Falls back to the built-in default dataviewjs card.
	 */
	private async resolveNewContactBody(): Promise<string> {
		const templatePath = this.settings.contactTemplatePath.trim();
		if (templatePath) {
			const templateFile = this.app.vault.getAbstractFileByPath(normalizePath(templatePath));
			if (templateFile instanceof TFile) {
				const raw = await this.app.vault.read(templateFile);
				// Strip YAML frontmatter if the template has any
				const bodyMatch = raw.match(/^---[\s\S]*?---\n?([\s\S]*)$/);
				return bodyMatch ? bodyMatch[1] : raw;
			}
			console.warn(`Contact template not found: ${templatePath}. Creating blank note.`);
		}
		return '';
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
