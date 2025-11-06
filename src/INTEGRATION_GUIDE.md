# Integrating with the Shravya World Authentication Service

This document provides all the necessary information and instructions for integrating your Firebase-hosted application with the centralized Shravya World authentication service.

## 1. High-Level Architecture

The authentication flow is designed to be seamless and secure, providing a Single Sign-On (SSO) experience.

1.  **Redirect to Auth Portal:** When an unauthenticated user tries to access a protected page in your app, your application redirects them to the central authentication portal (`auth.shravyaworld.org`).
2.  **User Authentication:** The portal securely handles the entire sign-in or sign-up process.
3.  **Session Cookie Creation:** Upon successful login, the portal's backend creates a secure, HTTP-only session cookie scoped to the parent domain (`.shravyaworld.org`). This makes the cookie automatically available to all subdomains, including your application.
4.  **Redirect Back to Your App:** The user is then redirected back to the page they were originally trying to access in your application.
5.  **Authenticated State:** Your application's backend can now read and verify the session cookie on subsequent requests to confirm the user's identity and grant access to protected resources.

---

## 2. Initial Setup and Configuration

Before writing any integration code, you must register your application with the central `shravya-foundation` Firebase project.


## 3. Client-Side (Frontend) Integration

### Step 3.1: Handling Login

Create a login button or link that redirects the user to the central auth portal. You must include a `redirectUrl` query parameter so the portal knows where to send the user back.

```javascript
// Example of a login function in a React/Next.js application
const handleLogin = () => {
  // The URL of your app where the user should be sent back after logging in.
  const redirectUrl = 'https://YOUR-APP.shravyaworld.org/dashboard';
  
  // The URL of the central authentication portal.
  const authPortalUrl = `https://auth.shravyaworld.org/login?redirectUrl=${encodeURIComponent(redirectUrl)}`;

  // Redirect the user.
  window.location.href = authPortalUrl;
};
```

### Step 3.2: Handling Logout

To log a user out, call the central `sessionLogout` Cloud Function.

1.  **Install the Firebase SDK:** `npm install firebase`
2.  **Call the `sessionLogout` function:**

```javascript
import { initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Use the config from Step 2.1
const firebaseConfig = { /* ... your config ... */ };
const app = initializeApp(firebaseConfig);
const functions = getFunctions(app, 'us-central1');

const handleLogout = async () => {
  try {
    const sessionLogout = httpsCallable(functions, 'sessionLogout');
    await sessionLogout();
    
    // After the cookie is cleared, refresh or redirect to a public page.
    window.location.href = '/'; 
  } catch (error) {
    console.error("Logout failed:", error);
  }
};
```

---

## 4. Server-Side (Backend) Integration

Your backend is responsible for securing your API endpoints and pages by verifying the session cookie.

1.  **Install the Firebase Admin SDK:** `npm install firebase-admin`
2.  **Create Middleware to Verify the Session Cookie:**

This middleware acts as a gatekeeper for your protected routes.

**Example for a Next.js App (in `middleware.ts`):**
```typescript
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
```
