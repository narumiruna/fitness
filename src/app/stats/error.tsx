"use client";

import { PageError } from "@/components/page-error";
import { englishMessages } from "@/lib/messages";
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <PageError
      onRetry={retry}
      message={englishMessages.pageError}
      retry={englishMessages.tryAgain}
    />
  );
}
