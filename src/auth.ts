import { jwtVerify } from "jose";

/** Who is calling, as established by a verified token. Never taken from tool arguments. */
export interface Principal {
	sub: string;
	tenant: string;
	scopes: string[];
}

export const ISSUER = "mock-idp";
export const AUDIENCE = "yunhai-agent-tools";

export const SCOPE_READ = "integrations:read";
export const SCOPE_WRITE = "integrations:write";

export class AuthError extends Error {}

/**
 * Verify a bearer token and return the caller. The identity provider decides the
 * token's scopes and tenant (from the user's profile); the Worker only checks them.
 */
export async function verifyBearer(header: string | null, secret: string): Promise<Principal> {
	if (!header || !header.startsWith("Bearer ")) throw new AuthError("missing bearer token");
	try {
		const { payload } = await jwtVerify(header.slice("Bearer ".length), new TextEncoder().encode(secret), {
			issuer: ISSUER,
			audience: AUDIENCE,
			algorithms: ["HS256"],
		});
		const tenant = payload["tenant"];
		const scope = payload["scope"];
		if (typeof payload.sub !== "string" || typeof tenant !== "string" || tenant === "" || typeof scope !== "string") {
			throw new AuthError("token is missing required claims");
		}
		return { sub: payload.sub, tenant, scopes: scope.split(" ").filter(Boolean) };
	} catch (e) {
		// One message for every failure, so callers learn nothing about why. The operator log keeps the reason.
		console.log(JSON.stringify({ event: "auth_denied", reason: (e as Error).message }));
		throw new AuthError("invalid or expired token");
	}
}

/** The token's scope must cover the scope the tool declares. */
export function covers(principal: Principal, required: string): boolean {
	return principal.scopes.includes(required);
}
