import { parseTenantFromHost } from "../src/server/tenant-routing";

const cases: Array<[string, string]> = [
  ["localhost:3000", "root"],
  ["gracie.localhost:3000", "tenant=gracie"],
  ["admin.localhost:3000", "admin"],
  ["app.simplifica.com.br", "root"],
  ["gracie.app.simplifica.com.br", "tenant=gracie"],
  ["admin.app.simplifica.com.br", "admin"],
  ["", "root"],
  ["Gracie.LOCALHOST", "tenant=gracie (case-insensitive)"],
  ["_invalid.localhost", "root (slug inválido)"],
];

let pass = 0;
let fail = 0;
for (const [host, expected] of cases) {
  const r = parseTenantFromHost(host);
  const got = r.kind === "tenant" ? `tenant=${r.slug}` : r.kind;
  const ok = expected.startsWith(got);
  if (ok) pass++;
  else fail++;
  const mark = ok ? "✓" : "✗";
  console.log(`  ${mark} ${host.padEnd(38)} → ${got.padEnd(18)} (esperado: ${expected})`);
}
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
