import { Select } from "@radix-ui/themes";
import { useEffect, useRef, useState } from "react";

type FormSelectProps = {
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  defaultValue?: string;
  form?: string;
  required?: boolean;
};

// Render the selected label during SSR and preserve native form association.
export function FormSelect({
  name,
  label,
  options,
  defaultValue = options[0]?.value ?? "",
  form,
  required,
}: FormSelectProps) {
  const initialValue = options.some((option) => option.value === defaultValue)
    ? defaultValue
    : (options[0]?.value ?? "");
  const [value, setValue] = useState(initialValue);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const owner = form
      ? document.getElementById(form)
      : triggerRef.current?.closest("form");
    const reset = () => setValue(initialValue);
    owner?.addEventListener("reset", reset);
    return () => owner?.removeEventListener("reset", reset);
  }, [form, initialValue]);

  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? label;

  return (
    <Select.Root
      name={name}
      form={form}
      required={required}
      value={value}
      onValueChange={setValue}
    >
      <Select.Trigger
        ref={triggerRef}
        aria-label={label}
        placeholder={selectedLabel}
      >
        {selectedLabel}
      </Select.Trigger>
      <Select.Content position="popper">
        {options.map((option) => (
          <Select.Item key={option.value} value={option.value}>
            {option.label}
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Root>
  );
}
