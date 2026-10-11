// Deploy-pipeline check: fail the build if a data-location precondition is broken.
import { readFileSync } from "node:fs";

const text = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8")
	.split("\n")
	.filter((l) => !l.trim().startsWith("//"))
	.join("\n");
const config = JSON.parse(text);

const problems = [];
if (config.workers_dev !== false) problems.push("workers_dev must be false (workers.dev is not a regional service)");
if (config.placement !== undefined) problems.push("Smart Placement must be off (remove the placement setting)");
if (config.observability?.enabled !== false) problems.push("built-in Workers Logs must be off (observability.enabled: false)");
for (const name of ["READ_LIMITER", "WRITE_LIMITER"]) {
	if (!config.ratelimits?.some((r) => r.name === name)) problems.push(`rate limit binding ${name} must be declared`);
}

if (problems.length) {
	console.error("Config check FAILED:\n- " + problems.join("\n- "));
	process.exit(1);
}
console.log("Config check passed: workers.dev off, Smart Placement off, built-in Workers Logs off, rate limits declared.");
