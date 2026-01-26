import { useState, useRef, useCallback } from 'react';
import { resizeAndConvertToWebP } from '../utils/imageUtils';

export interface UseAvatarUploadResult {
  preview: string | null;
  data: string | null;
  error: string | null;
  selectFile: (file: File) => Promise<void>;
  reset: () => void;
  triggerSelect: () => void;
  inputProps: {
    ref: React.RefObject<HTMLInputElement>;
    type: 'file';
    accept: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    style: React.CSSProperties;
  };
}

export interface UseAvatarUploadOptions {
  initialPreview?: string | null;
  maxSize?: number;
}

export function useAvatarUpload({
  initialPreview = null,
  maxSize = 300,  // 300px looks crisp on 3x Retina displays at 100px display size
}: UseAvatarUploadOptions = {}): UseAvatarUploadResult {
  const [preview, setPreview] = useState<string | null>(initialPreview);
  const [data, setData] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null!);

  const selectFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    try {
      setError(null);
      const webpData = await resizeAndConvertToWebP(file, maxSize);
      setPreview(webpData);
      setData(webpData);
    } catch (err) {
      setError('Failed to process image');
      console.error(err);
    }
  }, [maxSize]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      selectFile(file);
    }
  }, [selectFile]);

  const reset = useCallback(() => {
    setPreview(initialPreview);
    setData(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [initialPreview]);

  const triggerSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return {
    preview,
    data,
    error,
    selectFile,
    reset,
    triggerSelect,
    inputProps: {
      ref: fileInputRef,
      type: 'file',
      accept: 'image/*',
      onChange: handleChange,
      style: { display: 'none' },
    },
  };
}
