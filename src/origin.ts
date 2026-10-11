/**
 * Mock origin with synthetic data. In production this is the product team's real
 * backend in the customer's home region, and it holds the data and the audit record.
 * The Worker itself stores nothing at rest.
 */
export interface Webhook {
	id: string;
	tenant: string;
	url: string;
	enabled: boolean;
}

export interface Integration {
	id: string;
	tenant: string;
	name: string;
	webhookId: string;
}

const seedWebhooks = (): Webhook[] => [
	{ id: "wh_merlion_1", tenant: "merlion-logistics", url: "https://example.invalid/hooks/merlion-1", enabled: true },
	{ id: "wh_merlion_2", tenant: "merlion-logistics", url: "https://example.invalid/hooks/merlion-2", enabled: true },
	{ id: "wh_rhein_1", tenant: "rhein-retail", url: "https://example.invalid/hooks/rhein-1", enabled: true },
];

const seedIntegrations = (): Integration[] => [
	{ id: "int_merlion_erp", tenant: "merlion-logistics", name: "ERP sync", webhookId: "wh_merlion_1" },
	{ id: "int_merlion_wms", tenant: "merlion-logistics", name: "Warehouse updates", webhookId: "wh_merlion_2" },
	{ id: "int_rhein_shop", tenant: "rhein-retail", name: "Shop orders", webhookId: "wh_rhein_1" },
];

let webhooks = seedWebhooks();
let integrations = seedIntegrations();

/** Reset the synthetic data. Used by tests and the demo script. */
export function resetOrigin(): void {
	webhooks = seedWebhooks();
	integrations = seedIntegrations();
}

export function listIntegrations(tenant: string): Array<Integration & { webhookEnabled: boolean }> {
	return integrations
		.filter((i) => i.tenant === tenant)
		.map((i) => ({ ...i, webhookEnabled: webhooks.find((w) => w.id === i.webhookId)?.enabled ?? false }));
}

export function findWebhook(id: string): Webhook | undefined {
	return webhooks.find((w) => w.id === id);
}

export function setWebhookEnabled(id: string, enabled: boolean): void {
	const hook = webhooks.find((w) => w.id === id);
	if (hook) hook.enabled = enabled;
}
