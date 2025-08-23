
import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScreenShare, Check, Smartphone, Upload } from 'lucide-react';

interface ScreenshotCaptureProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (dataUrl: string) => void;
  onUploadRequest: () => void; // Callback to trigger file input in parent
}

export function ScreenshotCapture({ open, onOpenChange, onCapture, onUploadRequest }: ScreenshotCaptureProps) {
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Detect if the user is on a mobile device
    const userAgent = typeof window.navigator === "undefined" ? "" : navigator.userAgent;
    const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
    setIsMobile(mobileRegex.test(userAgent));
  }, []);

  const takeScreenshot = useCallback(async () => {
    onOpenChange(false); // Hide the dialog to allow screen capture
    try {
      // @ts-ignore - getDisplayMedia is not fully typed in all environments
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      // @ts-ignore - ImageCapture is not fully typed in all environments
      const imageCapture = new ImageCapture(track);
      const bitmap = await imageCapture.grabFrame();
      track.stop(); // Stop the screen sharing

      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      context?.drawImage(bitmap, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      
      setScreenshot(dataUrl);
      onOpenChange(true); // Re-open the dialog to show the preview
    } catch (err) {
      console.error("Error taking screenshot: ", err);
      // Don't re-open the dialog if they cancel the screenshot prompt
    }
  }, [onOpenChange]);

  const confirmScreenshot = () => {
    if (screenshot) {
      onCapture(screenshot);
      onOpenChange(false);
      setScreenshot(null);
    }
  };
  
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setScreenshot(null);
    }
    onOpenChange(isOpen);
  };

  const handleUploadClick = () => {
    onOpenChange(false); // Close this dialog
    onUploadRequest(); // Ask the parent to open the file uploader
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Take a Screenshot</DialogTitle>
        </DialogHeader>
        {isMobile ? (
          <div className="py-8 flex flex-col items-center justify-center text-center">
            <Smartphone className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-6">
              To take a screenshot, please use your phone's built-in feature (usually Power + Volume Down buttons).
            </p>
            <Button onClick={handleUploadClick}>
              <Upload className="mr-2 h-4 w-4" />
              Upload from Photos
            </Button>
          </div>
        ) : screenshot ? (
          <div>
            <img src={screenshot} alt="Screenshot preview" className="w-full h-auto rounded-md" />
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => takeScreenshot()}>
                Retake
              </Button>
              <Button onClick={confirmScreenshot}>
                <Check className="mr-2 h-4 w-4" />
                Confirm
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="py-8 flex flex-col items-center justify-center">
            <p className="text-muted-foreground mb-4">Click the button below to capture your screen.</p>
            <Button onClick={takeScreenshot}>
              <ScreenShare className="mr-2 h-4 w-4" />
              Take Screenshot
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
