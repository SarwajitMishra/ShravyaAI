// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK. 
// In a serverless environment, you may need to explicitly provide service account credentials.
if (!admin.apps.length) {
  admin.initializeApp();
}

export async function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get('session')?.value || '';

  // Routes that do not require authentication
  const publicRoutes = ['/login', '/signup', '/public'];
  if (publicRoutes.some(path => request.nextUrl.pathname.startsWith(path))) {
    return NextResponse.next();
  }

  try {
    // Verify the cookie. Fails if invalid, expired, or revoked.
    await admin.auth().verifySessionCookie(sessionCookie, true /** checkRevoked */);
    return NextResponse.next();

  } catch (error) {
    // Session is invalid. Redirect to the login portal.
    const redirectUrl = request.url;
    const authPortalUrl = `https://auth.shravyaworld.org/login?redirectUrl=${encodeURIComponent(redirectUrl)}`;
    return NextResponse.redirect(authPortalUrl);
  }
}

// Define which routes are protected by this middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
