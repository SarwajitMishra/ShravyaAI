"use client";

import {
  getApp
} from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  User
} from "firebase/auth";
import {
  getFunctions,
  httpsCallable
} from "firebase/functions";
import {
  useEffect,
  useState
} from "react";

// A component to test Firebase Auth and Callable Functions
export default function AuthTestPage() {
  const [user, setUser] = useState < User | null > (null);
  const [log, setLog] = useState < string[] > ([]);
  const [isLoading, setIsLoading] = useState(true);

  const app = getApp();
  const auth = getAuth(app);
  const functions = getFunctions(app, "us-central1");

  // Log a message to the screen
  const logger = (message: string) => {
    console.log(message);
    setLog(prev => [...prev, message]);
  }

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsLoading(false);
      if (currentUser) {
        logger(`User is signed in with UID: ${currentUser.uid}`);
      } else {
        logger("User is not signed in.");
      }
    });
    return () => unsubscribe();
  }, [auth]);

  // Function to sign in anonymously
  const handleSignIn = async () => {
    if (user) return;
    logger("Attempting to sign in anonymously...");
    try {
      await signInAnonymously(auth);
      logger("Sign-in successful.");
    } catch (error: any) {
      logger(`Sign-in failed: ${error.message}`);
    }
  }

  // Function to run the test
  const runTest = async () => {
    if (!user) {
      logger("Cannot run test: User is not signed in.");
      return;
    }

    logger("---------------------------");
    logger("Attempting to call 'appendUserMessageAndGetResponse'...");

    const appendUserMessage = httpsCallable(functions, 'appendUserMessageAndGetResponse');

    try {
      // We send the minimum required data for the function to pass validation
      const result: any = await appendUserMessage({
        sessionId: "auth-test-session",
        context: {
          persona: "auth-test-persona"
        },
        message: {
          role: "user",
          content: "This is an authentication test."
        }
      });

      logger("✅ SUCCESS: Cloud Function executed successfully!");
      logger(`Full response: ${JSON.stringify(result.data, null, 2)}`);

    } catch (error: any) {
      logger(`❌ FAILURE: Cloud Function execution failed.`);
      if (error.code === "unauthenticated") {
        logger("Reason: The user is not considered authenticated by the backend.");
        logger("This confirms an authentication issue from the live domain.");
      } else {
        logger(`Error code: ${error.code}`);
        logger(`Error message: ${error.message}`);
      }
    }
    logger("---------------------------");

  }

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', backgroundColor: 'white', color: 'black', height: '100vh' }}>
      <h1>Authentication Test Page</h1>
      <p>This page tests if a user signed in from the live URL is correctly authenticated by the Firebase backend when calling a Cloud Function.</p>
      
      {isLoading ? (
        <p>Loading user status...</p>
      ) : (
        <>
          <button onClick={user ? runTest : handleSignIn} style={{ padding: '10px 20px', fontSize: '16px', marginRight: '10px' }}>
            {user ? "Run Auth Test" : "Sign In Anonymously"}
          </button>
          {user && <button onClick={runTest} style={{ padding: '10px 20px', fontSize: '16px' }}>Run Auth Test Again</button>}
        </>
      )}
      
      <h2>Logs:</h2>
      <pre style={{ backgroundColor: '#f0f0f0', padding: '10px', borderRadius: '5px', whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
        {log.join("\n")}
      </pre>
    </div>
  );
}