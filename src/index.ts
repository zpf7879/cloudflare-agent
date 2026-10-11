import { createMcpHandler } from "agents/mcp/server";
import { AuthError, verifyBearer } from "./auth";
import { createServer } from "./tools";

export interface Env {
	TOKEN_SECRET: string;
	/** Workers Rate Limiting bindings, declared in wrangler.jsonc. */
	READ_LIMITER: RateLimit;
	WRITE_LIMITER: RateLimit;
}

const unauthorized = (message: string) =>
	new Response(JSON.stringify({ error: "unauthorized", message }), {
		status: 401,
		headers: { "content-type": "application/json", "www-authenticate": 'Bearer realm="yunhai-agent-tools"' },
	});

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const { pathname } = new URL(request.url);
		if (pathname !== "/mcp") return new Response("Not found", { status: 404 });

		// Authenticate before the MCP handler sees the request. The handler does not verify tokens.
		let principal;
		try {
			principal = await verifyBearer(request.headers.get("authorization"), env.TOKEN_SECRET);
		} catch (e) {
			return unauthorized(e instanceof AuthError ? e.message : "unauthorized");
		}

		// The verified caller travels as props. Tools read it with getMcpAuthContext(),
		// never from tool arguments.
		const limits = { read: env.READ_LIMITER, write: env.WRITE_LIMITER };
		const handler = createMcpHandler(() => createServer(limits), {
			route: "/mcp",
			corsOptions: false,
			authContext: { props: { sub: principal.sub, tenant: principal.tenant, scopes: principal.scopes } },
		});
		return handler(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
