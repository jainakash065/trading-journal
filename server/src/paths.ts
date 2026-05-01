import fs from "node:fs";
import path from "node:path";

export const projectRoot: string = process.cwd();
export const dataDir: string = path.join(projectRoot, "data");
export const dbPath: string = path.join(dataDir, "journal.db");
export const entryScreenshotDir: string = path.join(dataDir, "screenshots", "entries");
export const exitScreenshotDir: string = path.join(dataDir, "screenshots", "exits");
export const backupDir: string = path.join(dataDir, "backups");

export function ensureDataFolders(): void {
  [dataDir, entryScreenshotDir, exitScreenshotDir, backupDir].forEach((folderPath: string) => {
    fs.mkdirSync(folderPath, { recursive: true });
  });
}
