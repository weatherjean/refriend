import { useState, useCallback } from 'react';

export type MessageType = 'success' | 'error' | 'info';

export interface Message {
  type: MessageType;
  text: string;
}

export interface UseMessageResult {
  message: Message | null;
  showSuccess: (text: string) => void;
  showError: (text: string) => void;
  showInfo: (text: string) => void;
  clear: () => void;
  setMessage: React.Dispatch<React.SetStateAction<Message | null>>;
}

export function useMessage(): UseMessageResult {
  const [message, setMessage] = useState<Message | null>(null);

  const showSuccess = useCallback((text: string) => {
    setMessage({ type: 'success', text });
  }, []);

  const showError = useCallback((text: string) => {
    setMessage({ type: 'error', text });
  }, []);

  const showInfo = useCallback((text: string) => {
    setMessage({ type: 'info', text });
  }, []);

  const clear = useCallback(() => {
    setMessage(null);
  }, []);

  return {
    message,
    showSuccess,
    showError,
    showInfo,
    clear,
    setMessage,
  };
}
