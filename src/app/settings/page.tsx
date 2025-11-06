
'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useRouter } from 'next/navigation';
import { initializeApp } from 'firebase/app';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const functions = getFunctions(app, 'us-central1');

const deleteAccountData = httpsCallable(functions, 'deleteAccountData');
const sessionLogout = httpsCallable(functions, 'sessionLogout');

export default function SettingsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [accentColor, setAccentColor] = useState('green');

  useEffect(() => {
    document.body.dataset.accentColor = accentColor;
  }, [accentColor]);

  const handleLogout = async () => {
    try {
      await sessionLogout();
      toast({ title: 'Logged Out', description: 'You have been successfully logged out.' });
      router.push('/');
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to log out.' });
    }
  };

  const handleDeleteData = async () => {
    try {
      await deleteAccountData();
      toast({ title: 'Data Deleted', description: 'Your account data has been successfully deleted.' });
      await handleLogout();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete account data.' });
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>Customize your experience.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-2">
            <Label htmlFor="theme">Theme</Label>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger>
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System Default</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="accent-color">Accent Color</Label>
            <Select value={accentColor} onValueChange={setAccentColor}>
              <SelectTrigger>
                <SelectValue placeholder="Select accent color" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="green">Green</SelectItem>
                <SelectItem value="red">Red</SelectItem>
                <SelectItem value="pink">Pink</SelectItem>
                <SelectItem value="magenta">Magenta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Account Data</Label>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full">Delete Account Data</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action is irreversible and will permanently delete all your data, including chat history and profile information.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteData}>Confirm Deletion</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
        <CardFooter className="flex-col gap-2">
          <Button variant="outline" className="w-full" onClick={handleLogout}>Logout</Button>
          <Button variant="outline" className="w-full" onClick={() => router.push('/chat')}>Back to Chat</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
