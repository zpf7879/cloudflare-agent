import { getMcpAuthContext } from "agents/mcp/server";
import { covers, type Principal } from "./auth";

export type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

export const ok = (text: string): ToolResult => ({ content: [{ type: "text", text }] });
export const deny = (text: string): ToolResult => ({ isError: true, content: [{ type: "text", text: `Denied: ${text}` }] });

interface AuditEntry {
	tool: string;
	kind: "read" | "write";
	tenant: string;
	sub: string;
	target?: string;
	outcome: "allowed" | "denied";
	reason?: string;
}

/**
 * Metadata only: ids, outcome and reason. Never payloads, secrets or webhook URLs.
 * In production each region ships this to its own bucket, and the origin keeps the
 * system-of-record audit entry for writes.
 */
export function audit(entry: AuditEntry & { requestId: string }): void {
	console.log(JSON.stringify({ event: "audit", ts: new Date().toISOString(), ...entry }));
}

/** The caller, as verified by the Worker before any tool runs. */
export function currentPrincipal(): Principal | undefined {
	const props = getMcpAuthContext()?.props;
	if (!props || typeof props["tenant"] !== "string" || !Array.isArray(props["scopes"])) return undefined;
	return { sub: String(props["sub"]), tenant: props["tenant"], scopes: props["scopes"].map(String) };
}

export interface GuardContext {
	principal: Principal;
	requestId: string;
	/** Record the outcome for this call. Metadata only. */
	record: (outcome: "allowed" | "denied", target?: string, reason?: string) => void;
}

/** Rate limiters, one per tool kind. `guarded` picks one from the tool's kind. */
export interface Limiters {
	read: RateLimit;
	write: RateLimit;
}

/**
 * The shared auth wrapper. Every tool goes through it, so no tool can skip the check.
 * 1. The token's scope must cover the scope the tool declares (reads and writes alike).
 * 2. A rate limit keyed on tenant and tool name. It limits the damage, not the intent: an
 *    authorized agent that follows planted instructions still gets its first writes through.
 *    The limiter is chosen from the tool's kind, so a write tool cannot get the read limit.
 * 3. The tenant comes from the verified token. The tool handler receives it and may only
 *    act on that tenant's data.
 * Nothing here depends on prompt text.
 */
export function guarded<A>(
	tool: string,
	kind: "read" | "write",
	requiredScope: string,
	limits: Limiters,
	handler: (args: A, ctx: GuardContext) => ToolResult | Promise<ToolResult>,
): (args: A) => Promise<ToolResult> {
	const limiter = limits[kind];
	return async (args: A) => {
		const requestId = crypto.randomUUID();
		const principal = currentPrincipal();
		if (!principal) {
			return deny("no verified caller");
		}
		let recorded = false;
		const record: GuardContext["record"] = (outcome, target, reason) => {
			recorded = true;
			audit({ requestId, tool, kind, tenant: principal.tenant, sub: principal.sub, target, outcome, reason });
		};

		if (!covers(principal, requiredScope)) {
			record("denied", undefined, `missing_scope:${requiredScope}`);
			return deny(`this token does not carry the ${requiredScope} scope`);
		}
		// Checked after the scope, so callers who may not use the tool never spend its quota.
		// The key holds ids only: tenant and tool name.
		const { success } = await limiter.limit({ key: `${principal.tenant}:${tool}` });
		if (!success) {
			record("denied", undefined, "rate_limited");
			return deny(`rate limit reached for ${tool}; try again in a minute`);
		}
		// The handler may record details (target, reason). If it records nothing, or throws,
		// the guard still writes the record, so no tool can leave a call unaudited.
		try {
			const result = await handler(args, { principal, requestId, record });
			if (!recorded) record(result.isError ? "denied" : "allowed");
			return result;
		} catch (e) {
			record("denied", undefined, "handler_error");
			throw e;
		}
	};
}
