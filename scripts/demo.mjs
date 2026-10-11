// Repeatable requests against a locally running Worker (`npm run dev`).
//   npm run demo            (optionally: BASE_URL=http://localhost:8787)
import { mint } from "./make-token.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:8787";

async function call(label, bearer, tool, args = {}) {
	const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
	if (bearer) headers.authorization = `Bearer ${bearer}`;
	const res = await fetch(`${BASE}/mcp`, {
		method: "POST",
		headers,
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } }),
	});
	const raw = await res.text();
	const data = raw.split("\n").find((l) => l.startsWith("data:"))?.slice(5) ?? raw;
	let shown = raw;
	try {
		const body = JSON.parse(data);
		shown = body.result ? body.result.content[0].text : JSON.stringify(body.error ?? body);
		if (body.result?.isError) shown = `[tool error] ${shown}`;
	} catch {}
	if (label) console.log(`${label}\n  HTTP ${res.status}  ${shown}\n`);
	return shown;
}

const readOnly = await mint({ tenant: "merlion-logistics", scope: "integrations:read" });
const writer = await mint({ tenant: "merlion-logistics", scope: "integrations:read integrations:write" });

await call("1. No token                                  -> expect HTTP 401", null, "list_integrations");
await call("2. Read with the read scope                  -> expect Merlion rows only", readOnly, "list_integrations");
await call("3. WRITE with a read-only token              -> expect Denied", readOnly, "disable_webhook", { webhook_id: "wh_merlion_1" });
await call("4. WRITE to another tenant's webhook         -> expect Denied", writer, "disable_webhook", { webhook_id: "wh_rhein_1" });
await call("5. WRITE to own webhook with the write scope -> expect disabled", writer, "disable_webhook", { webhook_id: "wh_merlion_1" });
await call("6. Read again                                -> wh_merlion_1 now disabled", readOnly, "list_integrations");

// Steps 4 and 5 spent 2 of the 5 writes per minute for merlion-logistics:disable_webhook.
// Step 3 spent none, because it was denied by scope first. A looping agent hits the limit fast.
console.log("7. Burst of writes, as a looping agent would  -> expect 3 more allowed, then rate limited");
for (let i = 1; i <= 5; i++) {
	const shown = await call(null, writer, "disable_webhook", { webhook_id: "wh_merlion_2" });
	console.log(`  write ${i}: ${shown}`);
}
