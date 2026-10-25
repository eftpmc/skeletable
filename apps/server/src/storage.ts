import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/** Where uploaded files live. Local disk now; S3/R2 later behind the same interface. */
export interface Storage {
  put(key: string, data: Buffer): Promise<void>;
  /** Returns null when the key doesn't exist. */
  get(key: string): Promise<Buffer | null>;
  /** Deletes the key and everything under it. */
  remove(prefix: string): Promise<void>;
}

export class DiskStorage implements Storage {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error(`Invalid storage key: ${key}`);
    return full;
  }

  async put(key: string, data: Buffer) {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }

  async get(key: string) {
    try {
      return await readFile(this.resolve(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async remove(prefix: string) {
    await rm(this.resolve(prefix), { recursive: true, force: true });
  }
}
