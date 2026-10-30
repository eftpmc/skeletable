import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
const html = gunzipSync(await readFile(process.argv[2]!)).toString("utf8");
for (const needle of process.argv.slice(3)) {
  console.log(`\n${needle}`);
  let offset = 0;
  for (let i = 0; i < 5; i++) {
    const at = html.indexOf(needle, offset);
    if (at < 0) break;
    console.log(html.slice(Math.max(0, at - 160), at + 400));
    offset = at + needle.length;
  }
}
