import type { Db } from "@closet/db";
import type { Auth } from "./auth.js";
import type { Config } from "./config.js";
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
};
