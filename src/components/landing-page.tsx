
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { BrandIcon } from '@/components/brand-icon';
import { MessageSquare, Users, Palette, UploadCloud, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect } from 'react';

export function LandingPage() {
  const featureVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  useEffect(() => {
    // Add a custom shadow utility in your globals.css or here in a style tag
    // For simplicity, adding it here. In a real app, this would be in a CSS file.
    const styles = `
      .shadow-soft {
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
      }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.type = "text/css";
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    return () => {
      document.head.removeChild(styleSheet);
    };
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-beige">
      <header className="sticky top-0 z-50 w-full bg-beige/80 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2">
            <BrandIcon className="h-8 w-8 text-primary-saffron" />
            <span className="text-xl font-bold font-headline text-secondary-teal">Shravya AI</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/login">Login</Link>
            </Button>
            <Button asChild className="bg-primary-saffron hover:bg-primary-saffron/90">
              <Link href="/signup">Sign Up</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <motion.section 
          className="container mx-auto flex flex-col items-center justify-center px-4 md:px-6 py-20 text-center"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <BrandIcon className="h-24 w-24 text-primary-saffron mb-6" />
          <h1 className="text-4xl md:text-6xl font-bold font-headline text-secondary-teal">
            Mindful Conversations, <br />
            Indian Soul.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-gray-600">
            Your personal AI companion that understands Romanized Indian languages and cultural nuances.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4">
            <Button asChild size="lg" className="bg-primary-saffron hover:bg-primary-saffron/90">
              <Link href="/chat">
                Continue as Guest
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-secondary-teal text-secondary-teal hover:bg-secondary-teal/10 hover:text-secondary-teal">
              <Link href="#features">Learn More</Link>
            </Button>
          </div>
        </motion.section>

        {/* Feature Section */}
        <motion.section 
          id="features" 
          className="bg-white py-20"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          transition={{ staggerChildren: 0.2 }}
        >
          <div className="container mx-auto px-4 md:px-6">
            <h2 className="text-3xl font-bold text-center text-secondary-teal mb-12">How Shravya AI Understands You</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <motion.div className="flex flex-col items-center text-center p-6 bg-beige rounded-lg shadow-soft" variants={featureVariants}>
                <MessageSquare className="h-12 w-12 text-primary-saffron mb-4" />
                <h3 className="text-xl font-semibold text-secondary-teal mb-2">Multi-lingual Romanized Chat</h3>
                <p className="text-gray-600">
                  Converse naturally in Hinglish, Tanglish, and more. Shravya AI adapts to your style.
                </p>
              </motion.div>
              <motion.div className="flex flex-col items-center text-center p-6 bg-beige rounded-lg shadow-soft" variants={featureVariants}>
                <Palette className="h-12 w-12 text-primary-saffron mb-4" />
                <h3 className="text-xl font-semibold text-secondary-teal mb-2">Persona Modes</h3>
                <p className="text-gray-600">
                  Switch between Friend, Teacher, Spiritual guide, and more for tailored conversations.
                </p>
              </motion.div>
              <motion.div className="flex flex-col items-center text-center p-6 bg-beige rounded-lg shadow-soft" variants={featureVariants}>
                <UploadCloud className="h-12 w-12 text-primary-saffron mb-4" />
                <h3 className="text-xl font-semibold text-secondary-teal mb-2">Ask with Images & Docs</h3>
                <p className="text-gray-600">
                  (Coming Soon) Upload a file and ask questions to get insights from your documents and images.
                </p>
              </motion.div>
            </div>
          </div>
        </motion.section>
      </main>

      <footer className="bg-white">
        <div className="container mx-auto py-6 px-4 md:px-6 text-center text-gray-500">
          &copy; {new Date().getFullYear()} Shravya AI. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
