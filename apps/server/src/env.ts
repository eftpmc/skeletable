import type { Db } from "@skeleton/db";
import type { Auth } from "./auth.js";
import type { Config } from "./config.js";
import type { SourceInfo } from "@skeleton/shared";
import type { Source } from "./search/sources/index.js";
import type { Mailer } from "./alerts/mailer.js";
import type { Storage } from "./storage.js";

export type SessionUser = Auth["$Infer"]["Session"]["user"];

export type AppEnv = {
  Variables: {
    user: SessionUser | null;
  };
};

export type AuthedEnv = {
  Variables: {
    user: SessionUser;
  };
};

export type Deps = {
  config: Config;
  db: Db;
  auth: Auth;
  storage: Storage;
  /** Override the configured search sources (tests). */
  sources?: { sources: Source[]; info: SourceInfo[] };
  /** Override how email is sent (tests). Null means no email. */
  mailer?: Mailer | null;
};
