// Dev utility: snapshot live NTES/IRCTC responses into test/fixtures so the
// parsers have stable regression inputs. Re-run when upstream markup changes.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
mkdirSync(DIR, { recursive: true });

const BASE = "https://enquiry.indianrail.gov.in/mntes";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const jar = new Map();
const absorb = (r) => { for (const c of r.headers.getSetCookie?.() ?? []) { const [p] = c.split(";"); const i = p.indexOf("="); if (i > 0) jar.set(p.slice(0, i).trim(), p.slice(i + 1).trim()); } };
const ck = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
async function get(p, e = {}) { const r = await fetch(`${BASE}/${p}`, { headers: { "User-Agent": UA, Referer: `${BASE}/`, Cookie: ck(), ...e } }); absorb(r); return r; }
async function post(p, f) {
  const t = await (await get(`GetCSRFToken?t=${Date.now()}`, { "X-Requested-With": "XMLHttpRequest" })).text();
  const m = t.match(/name='([^']+)'\s+value='([^']+)'/);
  const r = await fetch(`${BASE}/${p}`, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", Referer: `${BASE}/`, Origin: "https://enquiry.indianrail.gov.in", Cookie: ck() }, body: new URLSearchParams({ ...f, [m[1]]: m[2] }) });
  absorb(r); return r.text();
}
const save = (n, s) => { writeFileSync(join(DIR, n), s); console.log(`  ${n.padEnd(28)} ${s.length} bytes`); };

const TRAIN = process.argv[2] ?? "12951";
const today = new Date();
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const jDate = `${String(today.getDate()).padStart(2,"0")}-${MON[today.getMonth()]}-${today.getFullYear()}`;

console.log("capturing NTES fixtures...");
await (await get("")).text();
save("schedule.html", await post("q?opt=TrainServiceSchedule&subOpt=show", { lan: "en", trainNo: TRAIN, appLang: "en" }));

const instances = await post("q?opt=TrainRunning&subOpt=FindStationList", { lan: "en", trainNo: TRAIN, appLang: "en" });
save("running-instances.html", instances);
const opt = instances.match(/<option[^>]*value="([A-Z]+#(?:true|false)#\d+)"/);
save("running-status.html", await post("tr?opt=TrainRunning&subOpt=ShowRunCStn", { lan: "en", trainNo: TRAIN, jStation: opt?.[1] ?? "", jDate, jDateDay: "", appLang: "en" }));

save("trains-between.html", await post("q?opt=TrainsBetweenStation&subOpt=tbs", { lan: "en", jFromStationInput: "CAN", jToStationInput: "PAY" }));
save("live-station.html", await post("q?opt=LiveStation&subOpt=show", { lan: "en", jFromStationInput: "NDLS", jToStationInput: "" }));

console.log("capturing IRCTC fixtures...");
const H = { "User-Agent": UA, "Content-Type": "application/json", Accept: "application/json", Referer: "https://www.irctc.co.in/online-charts/", Origin: "https://www.irctc.co.in" };
const iso = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
const comp = await (await fetch("https://www.irctc.co.in/online-charts/api/trainComposition", { method: "POST", headers: H, body: JSON.stringify({ trainNo: TRAIN, jDate: iso, boardingStation: "MMCT" }) })).text();
save("irctc-train-composition.json", comp);
const c = JSON.parse(comp);
const vb = await (await fetch("https://www.irctc.co.in/online-charts/api/vacantBerth", { method: "POST", headers: H, body: JSON.stringify({ trainNo: TRAIN, boardingStation: "MMCT", remoteStation: c.remote, trainSourceStation: c.from, jDate: c.trainStartDate, cls: "3A", chartType: 1 }) })).text();
save("irctc-vacant-berth.json", vb);
save("irctc-pnr-invalid.json", await (await fetch("https://www.irctc.co.in/eticketing/protected/mapps1/pnrenq/1234567890?pnrEnqType=E", { headers: { ...H, greq: String(Date.now()) } })).text());
console.log("done.");
