import { Button, Select, Text } from "@radix-ui/themes";
import { useState } from "react";

export function PreviousSession({
  exercises,
  history,
  labels,
}: {
  exercises: { id: string; defaultName: string }[];
  history: Record<
    string,
    { date: string; sets: { id: string; weight: number; reps: number }[] }
  >;
  labels: { exercise: string; previous: string; empty: string; copy: string };
}) {
  const [id, setId] = useState(exercises[0]?.id ?? "");
  const source = history[id];
  return (
    <div className="stack">
      <Select.Root name="exerciseId" value={id} onValueChange={setId} required>
        <Select.Trigger aria-label={labels.exercise} />
        <Select.Content>
          {exercises.map((e) => (
            <Select.Item key={e.id} value={e.id}>
              {e.defaultName}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
      <Text size="2">
        {labels.previous}: {source?.date ?? labels.empty}
      </Text>
      {source?.sets.map((s, i) => (
        <div key={s.id}>
          <Text size="2">
            {i + 1}. {s.weight} kg × {s.reps}{" "}
          </Text>
          <Button
            highContrast
            type="button"
            variant="soft"
            onClick={(event) => {
              const form = event.currentTarget.closest("form");
              for (const [name, value] of [
                ["weight", s.weight],
                ["reps", s.reps],
              ] as const) {
                const input = form?.querySelector<HTMLInputElement>(
                  `input[name="${name}"]`,
                );
                if (input) {
                  input.value = String(value);
                  input.dispatchEvent(new Event("input", { bubbles: true }));
                }
              }
            }}
          >
            {labels.copy}
          </Button>
        </div>
      ))}
    </div>
  );
}
