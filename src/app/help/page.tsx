
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Mail, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export default function HelpCenterPage() {
  const router = useRouter();

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Help Center</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="flex items-start gap-4">
            <Mail className="h-6 w-6 text-primary mt-1" />
            <div>
              <h3 className="font-semibold">Contact Us</h3>
              <p className="text-sm text-muted-foreground">
                Have a question or need support? Reach out to us.
              </p>
              <a href="mailto:support@shravya.ai" className="text-sm text-primary hover:underline">
                support@shravya.ai
              </a>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <Shield className="h-6 w-6 text-primary mt-1" />
            <div>
              <h3 className="font-semibold">Policy Center</h3>
              <p className="text-sm text-muted-foreground">
                Read our terms of service, privacy policy, and other legal documents.
              </p>
              <a href="/privacy-policy" className="text-sm text-primary hover:underline block">
                Privacy Policy
              </a>
              <a href="/terms-of-service" className="text-sm text-primary hover:underline block">
                Terms of Service
              </a>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button variant="outline" className="w-full" onClick={() => router.push('/chat')}>Back</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
