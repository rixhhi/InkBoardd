import { register } from "node:module";
import { installStylesRead } from "../frontend/src/lib/read-styles.ts";

installStylesRead();
register("./loader.mjs", import.meta.url);
