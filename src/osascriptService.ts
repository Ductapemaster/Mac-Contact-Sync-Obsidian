const { spawn } = require('child_process');

export interface IOsaScriptService {
    executeScript(script: string): Promise<string>;
}

export class OsaScriptService implements IOsaScriptService {
    async executeScript(script: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const osascript = spawn('osascript', ['-e', script]);

            let output: string = '';
			osascript.stdout.on('data', (data: Buffer) => {
				output += data.toString('utf-8');
			});
            osascript.stderr.on('data', (data: Buffer) => {
				const errorMsg = data.toString('utf-8');
				reject(new Error(`Error executing AppleScript: \n${errorMsg}`));
			});
            osascript.on('close', (code: number) => {
                if (code === 0) {
                    resolve(output);
                } else {
                    reject(new Error(`Error executing AppleScript: \n${output}`));
                }
            });
        });
    }
}
