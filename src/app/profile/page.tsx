
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/app/auth-provider';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [profile, setProfile] = useState({
    displayName: '',
    occupation: '',
    location: '',
    interests: '',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProfile() {
      if (user) {
        const profileRef = doc(db, `aiProfiles/${user.uid}`);
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists() && profileSnap.data().profile) {
          // Merge fetched data with initial state to ensure all keys are present
          const fetchedProfile = profileSnap.data().profile;
          setProfile(prev => ({ ...prev, ...fetchedProfile }));
        }
        setLoading(false);
      }
    }
    fetchProfile();
  }, [user]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setProfile(prev => ({ ...prev, [id]: value }));
  };

  const handleSave = async () => {
    if (user) {
      try {
        const profileRef = doc(db, `aiProfiles/${user.uid}`);
        await setDoc(profileRef, { profile }, { merge: true });
        toast({ title: 'Profile Updated', description: 'Your changes have been saved.' });
        router.push('/chat');
      } catch (error) {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to update profile.' });
      }
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Your Profile</CardTitle>
          <CardDescription>Update your personal information.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="displayName">Your Name</Label>
            <Input id="displayName" value={profile.displayName} onChange={handleInputChange} placeholder="What should we call you?" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="occupation">What do you do?</Label>
            <Input id="occupation" value={profile.occupation} onChange={handleInputChange} placeholder="e.g., Student, Engineer" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="location">Where are you based?</Label>
            <Input id="location" value={profile.location} onChange={handleInputChange} placeholder="e.g., Mumbai, India" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="interests">Your Interests</Label>
            <Input id="interests" value={profile.interests} onChange={handleInputChange} placeholder="e.g., Reading, Coding, Music" />
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={() => router.push('/chat')}>Back</Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
