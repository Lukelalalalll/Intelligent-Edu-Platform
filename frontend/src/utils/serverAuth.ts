/* global process */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAuthDisabled } from "@/utils/auth";

type AuthStatus = {
  configured: boolean;
  authenticated: boolean;
  username: string | null;
  available: boolean;
};

/**
 * Resolves the FastAPI base used by Next-compatible server components.
 */
function getServerFastApiBase(): string {
  const internal = process.env.FAST_API_INTERNAL_URL?.trim();
  if (internal) {
    return internal.replace(/\/+$/, "");
  }
  const fromEnv = process.env.NEXT_PUBLIC_FAST_API?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, "");
  }
  if (process.env.NODE_ENV === "development") {
    return "http://127.0.0.1:5009";
  }
  return "http://127.0.0.1:5009";
}

/**
 * Checks server-side auth status with the incoming request cookies.
 * Server layouts use this so unknown routes are not conflated with unauthenticated access.
 */
export async function getServerAuthStatus(): Promise<AuthStatus> {
  if (isAuthDisabled()) {
    return {
      configured: true,
      authenticated: true,
      username: "web",
      available: true,
    };
  }

  const h = await headers();
  const cookie = h.get("cookie") ?? "";

  try {
    const response = await fetch(`${getServerFastApiBase()}/api/v1/auth/status`, {
      method: "GET",
      headers: cookie ? { cookie } : undefined,
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        configured: true,
        authenticated: false,
        username: null,
        available: false,
      };
    }
    const data = (await response.json()) as Partial<AuthStatus>;
    return {
      configured: Boolean(data.configured),
      authenticated: Boolean(data.authenticated),
      username: data.username ?? null,
      available: true,
    };
  } catch {
    return {
      configured: true,
      authenticated: false,
      username: null,
      available: false,
    };
  }
}

/**
 * Enforces an app session for Next-compatible server routes.
 * Setup and unavailable auth states return to `/`; anonymous sessions receive an unauthorized hint.
 */
export async function requireAppSession() {
  if (isAuthDisabled()) {
    return;
  }
  const s = await getServerAuthStatus();
  if (!s.available) {
    redirect("/");
  }
  if (!s.configured) {
    redirect("/");
  }
  if (!s.authenticated) {
    redirect("/?reason=unauthorized");
  }
}
