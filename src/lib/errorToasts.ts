import { toast } from "sonner";

type ErrorLike = {
  code?: string;
  message?: string;
};

export type OperationErrorDetails = {
  title: string;
  description: string;
  retryable: boolean;
};

const isRetryableMessage = (message: string) =>
  message.includes("failed to fetch")
  || message.includes("network")
  || message.includes("timeout")
  || message.includes("temporar")
  || message.includes("rate limit")
  || message.includes("429");

export const getOperationErrorDetails = (operation: string, error: ErrorLike): OperationErrorDetails => {
  const message = (error.message || "Unknown error").toLowerCase();
  if (message.includes("timed out")) {
    return {
      title: `${operation} blocked`,
      description: "Your account is currently timed out in this server.",
      retryable: false,
    };
  }
  if (message.includes("muted")) {
    return {
      title: `${operation} blocked`,
      description: "Your account is currently muted in this server.",
      retryable: false,
    };
  }
  if (message.includes("banned")) {
    return {
      title: `${operation} blocked`,
      description: "Your account is banned in this server.",
      retryable: false,
    };
  }
  if (message.includes("row-level security") || message.includes("permission denied")) {
    return {
      title: `${operation} denied`,
      description: "You do not have permission to perform this action.",
      retryable: false,
    };
  }
  if (isRetryableMessage(message)) {
    return {
      title: `${operation} delayed`,
      description: "A network issue occurred. We queued this action and will retry automatically.",
      retryable: true,
    };
  }

  return {
    title: `${operation} failed`,
    description: error.message || "Unexpected error.",
    retryable: false,
  };
};

export const showOperationErrorToast = (
  operation: string,
  error: ErrorLike,
  options?: {
    requestId?: string;
    onRetryNow?: () => void;
  },
) => {
  const details = getOperationErrorDetails(operation, error);
  const suffix = options?.requestId ? ` Ref: ${options.requestId.slice(0, 8)}.` : "";
  toast.error(details.title, {
    description: `${details.description}${suffix}`,
    duration: 7000,
    action: options?.onRetryNow
      ? {
          label: "Retry now",
          onClick: options.onRetryNow,
        }
      : undefined,
  });
  return details;
};

