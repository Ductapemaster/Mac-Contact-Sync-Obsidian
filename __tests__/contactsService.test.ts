// __tests__/contactsService.test.ts

import { IOsaScriptService } from '../src/osascriptService';
import { IContactsService, ContactsService, ContactEntry, stripDiacritics } from '../src/contactsService';
import { TEST_VCARD_DATA } from './testVCards';

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

    test('loadContacts: returns originalFilename alongside normalized filename', async () => {
        const vCardStr = Array.from(TEST_VCARD_DATA.keys())[0];
        mockOsaScriptService.executeScript.mockResolvedValue(vCardStr);
        const service = new ContactsService(groupName, enabledContactFields, false, mockOsaScriptService);
        const result = await service.loadContacts();
        for (const [filename, entry] of result) {
            expect(entry).toHaveProperty('markdown');
            expect(entry).toHaveProperty('originalFilename');
            expect(entry.originalFilename).toBe(filename);
        }
    });

    test('loadContacts: normalization disabled — filename unchanged', async () => {
        const vCardStr = Array.from(TEST_VCARD_DATA.keys())[0];
        mockOsaScriptService.executeScript.mockResolvedValue(vCardStr);
        const service = new ContactsService(groupName, enabledContactFields, false, mockOsaScriptService);
        const result = await service.loadContacts();
        for (const [filename, entry] of result) {
            expect(filename).toBe(entry.originalFilename);
        }
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
