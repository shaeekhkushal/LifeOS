import { NextRequest, NextResponse } from "next/server";
import {
  createSession,
  createUser,
  deleteSession,
  findUserById,
  findUserByUsername,
  initializeUserData,
  passwordMatches,
  publicUser,
  removeUserSessions,
  updatePasswordForUser,
} from "@/lib/server/database";
import { getRequestUser, sessionCookieName, sessionLifetimeSeconds, validPassword } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function setSession(response: NextResponse, token: string): NextResponse {
  response.cookies.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionLifetimeSeconds,
  });
  return response;
}

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  const user = getRequestUser(request);
  return NextResponse.json({ user: user ? publicUser(user) : null });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return fail("Enter the requested information.");
  }

  const action = body.action;
  if (action === "signup") {
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const password = body.password;
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) return fail("Username must be 3–32 letters, numbers, dots, dashes, or underscores.");
    if (!displayName || displayName.length > 80) return fail("Enter a name up to 80 characters.");
    if (!validPassword(password)) return fail("Password must be between 6 and 128 characters.");
    if (findUserByUsername(username)) return fail("That username is already taken.", 409);
    try {
      const user = createUser(username, displayName, password);
      initializeUserData(user.id, displayName, body.legacyData && typeof body.legacyData === "object" ? body.legacyData as Record<string, unknown> : {});
      const token = createSession(user.id);
      return setSession(NextResponse.json({ user: publicUser(user) }), token);
    } catch (error) {
      console.error("Local signup failed:", error);
      return fail("Unable to create this account. Try another username.", 500);
    }
  }

  if (action === "login") {
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = body.password;
    const user = findUserByUsername(username);
    if (!user || typeof password !== "string" || !passwordMatches(password, user.passwordHash)) {
      return fail("Username or password is incorrect.", 401);
    }
    const token = createSession(user.id);
    return setSession(NextResponse.json({ user: publicUser(user) }), token);
  }

  if (action === "logout") {
    const token = request.cookies.get(sessionCookieName)?.value;
    if (token) deleteSession(token);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(sessionCookieName, "", { path: "/", maxAge: 0 });
    return response;
  }

  if (action === "change-password") {
    const user = getRequestUser(request);
    const password = body.password;
    const newPassword = body.newPassword;
    if (!user) return fail("Please log in first.", 401);
    if (typeof password !== "string" || !validPassword(newPassword)) return fail("Enter your current password and a new password of at least 6 characters.");
    const storedUser = findUserById(user.id);
    if (!storedUser || !passwordMatches(password, storedUser.passwordHash)) return fail("Current password is incorrect.", 401);
    if (!updatePasswordForUser(user.id, newPassword)) return fail("Unable to update password.", 500);
    removeUserSessions(user.id);
    const token = createSession(user.id);
    return setSession(NextResponse.json({ ok: true }), token);
  }

  return fail("Password changes are only available after signing in from Settings.", 403);
}
