
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Camera, RefreshCw, Check, SwitchCamera } from 'lucide-react';

interface CameraCaptureProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (dataUrl: string) => void;
}

export function CameraCapture({ open, onOpenChange, onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  }, [stream]);

  const startCamera = useCallback(async () => {
    // Stop any existing stream before starting a new one
    if (stream) {
      stopCamera();
    }
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: facingMode } 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Error accessing camera: ", err);
      onOpenChange(false);
    }
  }, [facingMode, onOpenChange, stream, stopCamera]);

  useEffect(() => {
    if (open) {
      startCamera();
    } else {
      stopCamera();
    }
    // Cleanup function to stop camera when component unmounts or dialog closes
    return () => {
      stopCamera();
    };
  }, [open, facingMode, startCamera, stopCamera]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setCapturedImage(null); // Clear image when closing
    }
    onOpenChange(isOpen);
  };
  
  const switchCamera = () => {
    setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
  };

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      context?.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
      const dataUrl = canvas.toDataURL('image/png');
      setCapturedImage(dataUrl);
      stopCamera(); // Stop camera after taking picture to show preview
    }
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    startCamera(); // Restart camera to take a new picture
  };

  const confirmPhoto = () => {
    if (capturedImage) {
      onCapture(capturedImage);
      handleOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Take a Picture</DialogTitle>
        </DialogHeader>
        <div className="relative">
          {capturedImage ? (
            <img src={capturedImage} alt="Captured" className="w-full h-auto rounded-md" />
          ) : (
            <video ref={videoRef} autoPlay playsInline className="w-full h-auto rounded-md" />
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>
        <DialogFooter className="flex justify-between">
          {capturedImage ? (
            <>
              <Button variant="outline" onClick={retakePhoto}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Retake
              </Button>
              <Button onClick={confirmPhoto}>
                <Check className="mr-2 h-4 w-4" />
                Confirm
              </Button>
            </>
          ) : (
            <div className="w-full flex justify-center items-center gap-4">
              <Button variant="outline" size="icon" onClick={switchCamera} title="Switch Camera">
                <SwitchCamera className="h-5 w-5" />
              </Button>
              <Button onClick={takePhoto}>
                <Camera className="mr-2 h-4 w-4" />
                Take Photo
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
