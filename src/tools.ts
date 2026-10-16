import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { SCOPE_READ, SCOPE_WRITE } from "./auth";
import { deny, guarded, type Limiters, ok } from "./guard";
import { findWebhook, listIntegrations, setWebhookEnabled } from "./origin";

/** A fresh server per request. The Worker keeps no MCP session and stores nothing at rest. */
export function createServer(limits: Limiters): McpServer {
	const server = new McpServer({ name: "yunhai-agent-tools", version: "0.1.0" });

	// READ. Needs the integrations:read scope. Returns only the caller's tenant.
	server.registerTool(
		"list_integrations",
		{
			description: "List the integrations of the caller's own tenant. Returns ids and webhook status only.",
			inputSchema: {},
		},
		guarded("list_integrations", "read", SCOPE_READ, limits, (_args: Record<string, never>, ctx) => {
			const rows = listIntegrations(ctx.principal.tenant).map((i) => ({
				id: i.id,
				name: i.name,
				webhook_id: i.webhookId,
				webhook_enabled: i.webhookEnabled,
			}));
			ctx.record("allowed");
			return ok(JSON.stringify(rows));
		}),
	);

	// WRITE (reversible: disable, not delete). Needs integrations:write, and the target
	// webhook must belong to the caller's tenant, which comes from the verified token.
	server.registerTool(
		"disable_webhook",
		{
			description:
				"Disable one webhook of the caller's own tenant. Reversible. Fails if the webhook does not belong to the caller's tenant.",
			inputSchema: { webhook_id: z.string().min(1).max(64) },
		},
		guarded("disable_webhook", "write", SCOPE_WRITE, limits, ({ webhook_id }: { webhook_id: string }, ctx) => {
			const hook = findWebhook(webhook_id);
			// Same answer for "does not exist" and "belongs to someone else", so nothing leaks.
			if (!hook || hook.tenant !== ctx.principal.tenant) {
				ctx.record("denied", webhook_id, "target_not_in_tenant");
				return deny("webhook not found for your tenant");
			}
			setWebhookEnabled(hook.id, false);
			ctx.record("allowed", hook.id);
			return ok(`Webhook ${hook.id} disabled.`);
		}),
	);

	return server;
}
