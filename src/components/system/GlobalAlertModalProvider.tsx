import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type AlertRequest = {
  id: string;
  message: string;
};

const normalizeMessage = (value: unknown) => {
  if (typeof value === "string") return value;
  if (value == null) return "Unknown alert";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const GlobalAlertModalProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentAlert, setCurrentAlert] = useState<AlertRequest | null>(null);
  const queueRef = useRef<AlertRequest[]>([]);
  const currentAlertRef = useRef<AlertRequest | null>(null);

  useEffect(() => {
    currentAlertRef.current = currentAlert;
  }, [currentAlert]);

  const showNextAlert = useCallback(() => {
    const next = queueRef.current.shift() || null;
    setCurrentAlert(next);
  }, []);

  const enqueueAlert = useCallback((message: unknown) => {
    const nextAlert: AlertRequest = {
      id: crypto.randomUUID(),
      message: normalizeMessage(message),
    };

    if (!currentAlertRef.current) {
      setCurrentAlert(nextAlert);
      return;
    }
    queueRef.current.push(nextAlert);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const originalAlert = window.alert.bind(window);

    window.alert = (message?: unknown) => {
      enqueueAlert(message);
    };

    return () => {
      window.alert = originalAlert;
    };
  }, [enqueueAlert]);

  return (
    <>
      {children}
      <AlertDialog
        open={!!currentAlert}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            showNextAlert();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Notice</AlertDialogTitle>
            <AlertDialogDescription>{currentAlert?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={showNextAlert}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default GlobalAlertModalProvider;
