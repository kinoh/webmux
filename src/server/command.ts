import { execFile } from "child_process";

export function runCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const msg = stderr?.trim() || error.message || `${command} command failed`;
        reject(new Error(msg));
        return;
      }
      resolve(stdout);
    });
  });
}
