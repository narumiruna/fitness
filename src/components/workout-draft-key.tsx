"use client";

import { useState } from "react";

// Revalidation can generate a new server prop; the mounted draft keeps its key.
export function WorkoutDraftKey({ initialKey }: { initialKey: string }) {
  const [key] = useState(initialKey);
  return <input type="hidden" name="key" value={key} />;
}
