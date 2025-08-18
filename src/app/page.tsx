
import AuthWrapper from '@/app/auth-wrapper';
import { LandingPage } from '@/components/landing-page';

export default function Home() {
  return (
    <AuthWrapper>
      <LandingPage />
    </AuthWrapper>
  );
}
