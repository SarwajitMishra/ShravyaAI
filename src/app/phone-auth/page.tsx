
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from "firebase/auth";

declare global {
    interface Window {
        recaptchaVerifier?: RecaptchaVerifier;
    }
}

export default function PhoneAuthPage() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
            'size': 'invisible',
        });
    }
  }, []);

  const handleSendOtp = async () => {
    setError(null);
    if (!phoneNumber) {
      setError("Please enter a phone number.");
      return;
    }

    try {
      const verifier = window.recaptchaVerifier;
      if (verifier) {
          const confirmation = await signInWithPhoneNumber(auth, phoneNumber, verifier);
          setConfirmationResult(confirmation);
          setOtpSent(true);
      }
    } catch (error: any) {
      setError(error.message);
      // This can happen if the reCAPTCHA challenge is not completed.
      // We can try to render it again.
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.render().catch(console.error);
      }
    }
  };

  const handleVerifyOtp = async () => {
    setError(null);
    if (!otp) {
      setError("Please enter the OTP.");
      return;
    }

    if (confirmationResult) {
      try {
        await confirmationResult.confirm(otp);
        router.push("/chat");
      } catch (error: any) {
        setError(error.message);
      }
    }
  };
  
  const handleResendOtp = async () => {
    setOtp("");
    setConfirmationResult(null);
    setOtpSent(false);
    await handleSendOtp();
  };

  const handleChangeNumber = () => {
    setPhoneNumber("");
    setOtp("");
    setConfirmationResult(null);
    setOtpSent(false);
    setError(null);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="mx-auto max-w-sm w-full">
        <CardHeader>
          <CardTitle className="text-2xl">Phone Sign-in</CardTitle>
          <CardDescription>
            {otpSent ? "Enter the OTP sent to your phone" : "Enter your phone number to receive an OTP"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {!otpSent ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+1 555-555-5555"
                    required
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                  />
                </div>
                <Button onClick={handleSendOtp} className="w-full">
                  Send OTP
                </Button>
              </>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="otp">OTP</Label>
                  <Input
                    id="otp"
                    type="text"
                    placeholder="123456"
                    required
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                  />
                </div>
                <Button onClick={handleVerifyOtp} className="w-full">
                  Verify OTP
                </Button>
                <div className="flex justify-between text-sm">
                    <Button variant="link" onClick={handleResendOtp}>Resend OTP</Button>
                    <Button variant="link" onClick={handleChangeNumber}>Change Number</Button>
                </div>
              </>
            )}
            {error && <p className="text-destructive text-sm">{error}</p>}
            <div id="recaptcha-container"></div>
          </div>
          <div className="mt-4 text-center text-sm">
            <Link href="/login" className="underline">
              Back to Login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
