import { App, TFile, TFolder, normalizePath, parseYaml, stringifyYaml } from "obsidian";

export interface IFileService {
    createFolder(folderPath: string, app: App): Promise<void>;
    saveFile(filePath: string, frontmatter: Record<string, any>, body: string, app: App): Promise<TFile>;
    updateFile(file: TFile, frontmatter: Record<string, any>, app: App): Promise<void>;
}

export class FileService implements IFileService {
    async createFolder(folderPath: string, app: App): Promise<void> {
        if (await app.vault.adapter.exists(normalizePath(folderPath)) == false)
            await app.vault.createFolder(folderPath);
    }

    async saveFile(filePath: string, frontmatter: Record<string, any>, body: string, app: App): Promise<TFile> {
        const fmStr = stringifyYaml(frontmatter);
        const content = `---\n${fmStr}---\n\n${body}`;
        return app.vault.create(filePath, content);
    }

    async updateFile(file: TFile, frontmatter: Record<string, any>, app: App): Promise<void> {
        await app.vault.process(file, (content: string) => {
            const lines = content.split('\n');

            // No frontmatter — prepend it and leave the body untouched
            if (lines[0]?.trim() !== '---') {
                return `---\n${stringifyYaml(frontmatter)}---\n\n${content}`;
            }

            const fmEndIndex = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
            if (fmEndIndex === -1) {
                // Malformed frontmatter — prepend and leave body untouched
                return `---\n${stringifyYaml(frontmatter)}---\n\n${content}`;
            }

            const existingFm: Record<string, any> = parseYaml(lines.slice(1, fmEndIndex).join('\n')) ?? {};

            // Replace all contact-* keys; preserve everything else
            for (const key of Object.keys(existingFm)) {
                if (key.startsWith('contact-')) delete existingFm[key];
            }
            const newFm = { ...existingFm, ...frontmatter };

            const body = lines.slice(fmEndIndex + 1).join('\n');
            return `---\n${stringifyYaml(newFm)}---\n${body}`;
        });
    }
}
