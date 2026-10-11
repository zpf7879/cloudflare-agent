// Mock identity provider: prints a signed token for a tenant and a set of scopes.
//   npm run token -- --tenant merlion-logistics --scope "integrations:read integrations:write" --ttl 5m
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { SignJWT } from "jose";

export function readSecret() {
	if (process.env.TOKEN_SECRET) return process.env.TOKEN_SECRET;
	try {
		const line = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
			.split("\n")
			.find((l) => l.startsWith("TOKEN_SECRET="));
		if (line) return line.slice("TOKEN_SECRET=".length).trim();
	} catch {}
	throw new Error("No TOKEN_SECRET. Run: cp .dev.vars.example .dev.vars");
}

export async function mint({ tenant, scope, ttl = "5m", sub = "agent-demo" }) {
	return new SignJWT({ tenant, scope })
		.setProtectedHeader({ alg: "HS256" })
		.setIssuer("mock-idp")
		.setAudience("yunhai-agent-tools")
		.setSubject(sub)
		.setIssuedAt()
		.setExpirationTime(ttl)
		.sign(new TextEncoder().encode(readSecret()));
}

// Run as a CLI only when invoked directly. pathToFileURL makes this work on Windows too.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const arg = (name, fallback) => {
		const i = process.argv.indexOf(`--${name}`);
		return i > -1 ? process.argv[i + 1] : fallback;
	};
	const tenant = arg("tenant");
	const scope = arg("scope");
	if (!tenant || !scope) {
		console.error('Usage: npm run token -- --tenant <tenant> --scope "<scopes>" [--ttl 5m]');
		process.exit(1);
	}
	console.log(await mint({ tenant, scope, ttl: arg("ttl", "5m") }));
}
