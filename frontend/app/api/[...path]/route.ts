import { NextRequest, NextResponse } from "next/server";

/**
 * Catch-all API proxy that forwards requests to the backend.
 * Unlike Next.js rewrites(), this properly forwards Set-Cookie headers
 * so HttpOnly auth cookies work correctly.
 */

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || "http://localhost:8000";

async function proxyRequest(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join("/");
  const url = new URL(`/api/${path}`, BACKEND_URL);

  // Forward query params
  req.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  // Forward headers (excluding host)
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "host") {
      headers.set(key, value);
    }
  });

  // Forward cookies explicitly
  const cookieHeader = req.headers.get("cookie");
  if (cookieHeader) {
    headers.set("cookie", cookieHeader);
  }

  try {
    const fetchOptions: RequestInit = {
      method: req.method,
      headers,
      // @ts-ignore - duplex needed for streaming request bodies
      duplex: "half",
    };

    // Forward body for non-GET/HEAD requests
    if (req.method !== "GET" && req.method !== "HEAD") {
      fetchOptions.body = req.body;
    }

    const backendRes = await fetch(url.toString(), fetchOptions);

    // Build response with ALL headers from backend (including Set-Cookie)
    const responseHeaders = new Headers();
    backendRes.headers.forEach((value, key) => {
      // Forward all headers — especially Set-Cookie for auth
      responseHeaders.append(key, value);
    });

    return new NextResponse(backendRes.body, {
      status: backendRes.status,
      statusText: backendRes.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(`API proxy error: ${req.method} /api/${path}`, error);
    return NextResponse.json(
      { error: { code: "PROXY_ERROR", message: "Backend unavailable" } },
      { status: 502 }
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
