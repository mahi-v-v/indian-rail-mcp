import { readFileSync } from "node:fs";
const P = await import("./src/core/ntes/parse.ts");
console.log("INSTANCES:", JSON.stringify(P.parseRunningInstances(readFileSync("./test/fixtures/running-instances.html","utf8"))));
