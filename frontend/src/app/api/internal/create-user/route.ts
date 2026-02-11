import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const LOCAL_AUTH_DOMAIN = (
  process.env.NEXT_PUBLIC_LOCAL_AUTH_DOMAIN || "local.vymanager"
).toLowerCase();

function normalizeIdentifierToEmail(identifier: string): string {
  const value = String(identifier || "").trim().toLowerCase();
  if (!value) {
    throw new Error("Username or email is required");
  }

  if (/^[^\s@]+@[^\s@]+$/.test(value)) {
    return value;
  }

  if (!/^[a-z0-9._-]{1,64}$/.test(value)) {
    throw new Error(
      "Username must be 1-64 chars and only use letters, numbers, dot, underscore, or hyphen"
    );
  }

  return `${value}@${LOCAL_AUTH_DOMAIN}`;
}

/**
 * Internal API endpoint for creating users from the backend.
 * Uses Better Auth's internal user creation to ensure proper password hashing.
 *
 * This endpoint should only be accessible from the backend container.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, identifier, password, name } = body;

    const normalizedEmail = normalizeIdentifierToEmail(email || identifier);

    // Validate required fields
    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Password is required and must be a string" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Use Better Auth's internal API to create the user
    // This ensures password hashing is done correctly
    const result = await auth.api.signUpEmail({
      body: {
        email: normalizedEmail,
        password,
        name: name || normalizedEmail.split("@")[0],
      },
    });

    if (!result) {
      return NextResponse.json(
        { error: "Failed to create user" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Failed to create user";

    // Check for specific error types
    if (errorMessage.includes("already exists") || errorMessage.includes("duplicate")) {
      return NextResponse.json(
        { error: "Login identifier already exists" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
