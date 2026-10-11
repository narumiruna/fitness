"use client";

import { Checkbox } from "@radix-ui/themes";
import { useState } from "react";

export function NotesCheckbox({ defaultChecked }: { defaultChecked: boolean }) {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <>
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => setChecked(value === true)}
      />
      {/* Keep the GET form value in the same render as the visible state. */}
      <input type="hidden" name="notes" value="1" disabled={!checked} />
    </>
  );
}
