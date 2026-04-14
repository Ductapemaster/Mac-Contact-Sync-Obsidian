// __tests__/contactsService.test.ts

import { IOsaScriptService } from '../src/osascriptService';
import { IContactsService, ContactsService, ContactEntry, stripDiacritics, alternateFilename } from '../src/contactsService';
import { TEST_VCARD_DATA, DIACRITIC_VCARD_STRING } from './testVCards';

const vcf = require('vcf');

export class MockOsaScriptService implements IOsaScriptService {
    executeScript = jest.fn();
}

describe('Test ContactsService', () => {
    let mockOsaScriptService: MockOsaScriptService;
    let contactsService: IContactsService;

    const groupName = 'testGroup';
    const enabledContactFields = 'nickname,emails,title,organization,telephones,addresses,birthdate,URLs,notes';

    beforeEach(() => {
        mockOsaScriptService = new MockOsaScriptService();
        contactsService = new ContactsService(groupName, enabledContactFields, false, mockOsaScriptService);
    });

    test('ContactsService initializes correctly', () => {
        expect(contactsService).toBeDefined();
    });

    test('getNumberOfContacts: uses AppleScript (not JXA)', async () => {
        mockOsaScriptService.executeScript.mockResolvedValue('0');
        await contactsService.getNumberOfContacts();
        const script: string = mockOsaScriptService.executeScript.mock.calls[0][0];
        expect(script).toContain('tell application "Contacts"');
        expect(script).not.toContain('-l JavaScript');
        expect(script).not.toContain('whose');
    });

    test('getVCards: uses AppleScript (not JXA)', async () => {
        mockOsaScriptService.executeScript.mockResolvedValue('');
        await contactsService.getVCards();
        const script: string = mockOsaScriptService.executeScript.mock.calls[0][0];
        expect(script).toContain('tell application "Contacts"');
        expect(script).not.toContain('ObjC.import');
        expect(script).not.toContain('whose');
    });

    test('getNumberOfContacts: uses group name in script', async () => {
        mockOsaScriptService.executeScript.mockResolvedValue('0');
        await contactsService.getNumberOfContacts();
        const script: string = mockOsaScriptService.executeScript.mock.calls[0][0];
        expect(script).toContain(groupName);
    });

    test('getNumberOfContacts: valid response', async () => {
        mockOsaScriptService.executeScript.mockResolvedValue('3');
        const result = await contactsService.getNumberOfContacts();
        expect(result).toBe(3);
    });

    test('getNumberOfContacts: non-numeric response', async () => {
        mockOsaScriptService.executeScript.mockResolvedValue('abc');
        const resultPromise = contactsService.getNumberOfContacts();
        await expect(resultPromise).rejects.toThrow();
    });

    test('getNumberOfContacts: error response', async () => {
        mockOsaScriptService.executeScript.mockRejectedValue(new Error('dummy error'));
        const resultPromise = contactsService.getNumberOfContacts();
        await expect(resultPromise).rejects.toThrow();
    });

    test.each(Array.from(TEST_VCARD_DATA))('getVCards: valid response: single vCard', async (vCardStr, vCard) => {
        mockOsaScriptService.executeScript.mockResolvedValue(vCardStr);
        const result = await contactsService.getVCards();
        expect(result).toEqual([vCard]);
    });

    test('getVCards: valid response: multiple vCards', async () => {
        const combined = Array.from(TEST_VCARD_DATA.keys()).join('\r\n');
        mockOsaScriptService.executeScript.mockResolvedValue(combined);
        const result = await contactsService.getVCards();
        expect(result).toEqual(Array.from(TEST_VCARD_DATA.values()));
    });

    test('getVCards: error response', async () => {
        mockOsaScriptService.executeScript.mockRejectedValue(new Error('dummy error'));
        const resultPromise = contactsService.getVCards();
        await expect(resultPromise).rejects.toThrow();
    });

    test('loadContacts: entry has markdown, originalFilename, and normalizedFilename', async () => {
        const vCardStr = Array.from(TEST_VCARD_DATA.keys())[0];
        mockOsaScriptService.executeScript.mockResolvedValue(vCardStr);
        const service = new ContactsService(groupName, enabledContactFields, false, mockOsaScriptService);
        const result = await service.loadContacts();
        for (const [, entry] of result) {
            expect(entry).toHaveProperty('markdown');
            expect(entry).toHaveProperty('originalFilename');
            expect(entry).toHaveProperty('normalizedFilename');
        }
    });

    test('loadContacts: normalization OFF — map key equals originalFilename', async () => {
        mockOsaScriptService.executeScript.mockResolvedValue(DIACRITIC_VCARD_STRING);
        const service = new ContactsService(groupName, enabledContactFields, false, mockOsaScriptService);
        const result = await service.loadContacts();
        for (const [filename, entry] of result) {
            expect(filename).toBe(entry.originalFilename);
        }
    });

    test('loadContacts: normalization OFF — normalizedFilename differs from originalFilename for diacritic names', async () => {
        mockOsaScriptService.executeScript.mockResolvedValue(DIACRITIC_VCARD_STRING);
        const service = new ContactsService(groupName, enabledContactFields, false, mockOsaScriptService);
        const result = await service.loadContacts();
        const [[, entry]] = [...result];
        expect(entry.originalFilename).toBe('Østen Müller-Andreassen');
        expect(entry.normalizedFilename).toBe('Osten Muller-Andreassen');
        expect(entry.normalizedFilename).not.toBe(entry.originalFilename);
    });

    test('loadContacts: normalization ON — map key equals normalizedFilename', async () => {
        mockOsaScriptService.executeScript.mockResolvedValue(DIACRITIC_VCARD_STRING);
        const service = new ContactsService(groupName, enabledContactFields, true, mockOsaScriptService);
        const result = await service.loadContacts();
        for (const [filename, entry] of result) {
            expect(filename).toBe(entry.normalizedFilename);
        }
    });

    test('loadContacts: normalization ON — map key is stripped of diacritics', async () => {
        mockOsaScriptService.executeScript.mockResolvedValue(DIACRITIC_VCARD_STRING);
        const service = new ContactsService(groupName, enabledContactFields, true, mockOsaScriptService);
        const result = await service.loadContacts();
        const [[filename, entry]] = [...result];
        expect(filename).toBe('Osten Muller-Andreassen');
        expect(entry.originalFilename).toBe('Østen Müller-Andreassen');
    });

    test('loadContacts: plain-ASCII name — normalizedFilename equals originalFilename regardless of setting', async () => {
        const vCardStr = Array.from(TEST_VCARD_DATA.keys())[0]; // "Prefix First Middle Last"
        mockOsaScriptService.executeScript.mockResolvedValue(vCardStr);
        const serviceOff = new ContactsService(groupName, enabledContactFields, false, mockOsaScriptService);
        const resultOff = await serviceOff.loadContacts();
        for (const [filename, entry] of resultOff) {
            expect(entry.normalizedFilename).toBe(entry.originalFilename);
            expect(filename).toBe(entry.originalFilename);
        }
    });
});

describe('alternateFilename', () => {
    const makeEntry = (original: string, normalized: string): ContactEntry => ({
        markdown: '',
        originalFilename: original,
        normalizedFilename: normalized,
    });

    test('normalization ON: returns originalFilename so old un-normalized file can be found', () => {
        // Normalization is ON → map key (filename) === normalizedFilename
        const entry = makeEntry('Østen Andreassen', 'Osten Andreassen');
        expect(alternateFilename('Osten Andreassen', entry)).toBe('Østen Andreassen');
    });

    test('normalization OFF: returns normalizedFilename so old normalized file can be found', () => {
        // Normalization is OFF → map key (filename) === originalFilename
        const entry = makeEntry('Østen Andreassen', 'Osten Andreassen');
        expect(alternateFilename('Østen Andreassen', entry)).toBe('Osten Andreassen');
    });

    test('no diacritics: returns null (no rename needed)', () => {
        const entry = makeEntry('Plain Name', 'Plain Name');
        expect(alternateFilename('Plain Name', entry)).toBeNull();
    });
});

describe('stripDiacritics', () => {
    test('leaves plain ASCII unchanged', () => {
        expect(stripDiacritics('Hello World')).toBe('Hello World');
    });

    test('strips combining diacritics (NFD-decomposable)', () => {
        expect(stripDiacritics('café')).toBe('cafe');
        expect(stripDiacritics('naïve')).toBe('naive');
        expect(stripDiacritics('Ångström')).toBe('Angstrom');
        expect(stripDiacritics('Müller')).toBe('Muller');
    });

    test('replaces Ø/ø', () => {
        expect(stripDiacritics('Ø')).toBe('O');
        expect(stripDiacritics('ø')).toBe('o');
    });

    test('replaces Æ/æ', () => {
        expect(stripDiacritics('Æ')).toBe('Ae');
        expect(stripDiacritics('æ')).toBe('ae');
    });

    test('replaces Ð/ð', () => {
        expect(stripDiacritics('Ð')).toBe('D');
        expect(stripDiacritics('ð')).toBe('d');
    });

    test('replaces Þ/þ', () => {
        expect(stripDiacritics('Þ')).toBe('Th');
        expect(stripDiacritics('þ')).toBe('th');
    });

    test('replaces ß with ss', () => {
        expect(stripDiacritics('ß')).toBe('ss');
        expect(stripDiacritics('Straße')).toBe('Strasse');
    });

    test('replaces Ł/ł', () => {
        expect(stripDiacritics('Ł')).toBe('L');
        expect(stripDiacritics('ł')).toBe('l');
    });

    test('handles mixed string with multiple types', () => {
        expect(stripDiacritics('Østen Møller-Æriksen')).toBe('Osten Moller-Aeriksen');
    });
});
