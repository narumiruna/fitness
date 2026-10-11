"use client";
import { Text } from "@radix-ui/themes";
import { useEffect, useState } from "react";
export function RestTimer({
  deadline,
  label,
  activeSeconds,
  resumedAt,
  durationLabel,
}: {
  deadline: string | null;
  label: string;
  activeSeconds: number;
  resumedAt: string | null;
  durationLabel: string;
}) {
  const [remaining, setRemaining] = useState(0);
  const [duration, setDuration] = useState(activeSeconds);
  useEffect(() => {
    const tick = () => {
      setRemaining(
        deadline
          ? Math.max(0, Math.ceil((Date.parse(deadline) - Date.now()) / 1000))
          : 0,
      );
      setDuration(
        activeSeconds +
          (resumedAt
            ? Math.max(
                0,
                Math.floor((Date.now() - Date.parse(resumedAt)) / 1000),
              )
            : 0),
      );
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [deadline, activeSeconds, resumedAt]);
  return (
    <>
      <Text size="2">
        {durationLabel}: {duration}
      </Text>
      <Text size="2">
        {label}: {remaining}
      </Text>
    </>
  );
}
