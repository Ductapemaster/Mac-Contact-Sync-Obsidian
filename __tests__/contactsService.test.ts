// __tests__/contactsService.test.ts

import { IOsaScriptService } from '../src/osascriptService';
import { IContactsService, ContactsService } from '../src/contactsService';
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
        contactsService = new ContactsService(groupName, enabledContactFields, mockOsaScriptService);
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
});
