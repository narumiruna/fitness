"use client";
import { Button, Card, Text } from "@radix-ui/themes";
import { useState } from "react";
import {
  confirmImportAction,
  previewImportAction,
} from "@/app/actions/data-transfer";
import { FormSelect } from "./form-select";

function upload(text: string, mappings: Record<string, string> = {}) {
  const data = new FormData();
  data.set("file", new File([text], "workouts.csv", { type: "text/csv" }));
  data.set("mappings", JSON.stringify(mappings));
  return data;
}
export function DataImport({ labels }: { labels: Record<string, string> }) {
  const [text, setText] = useState("");
  const [preview, setPreview] =
    useState<Awaited<ReturnType<typeof previewImportAction>>>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Card className="stack">
      <Text as="label">
        {labels.file}
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={async (e) => {
            setPreview(undefined);
            setMessage("");
            const file = e.currentTarget.files?.[0];
            if (!file) {
              setText("");
              return;
            }
            if (file.size > 5 * 1024 * 1024) {
              setText("");
              setMessage(labels.csvError);
              return;
            }
            setText("");
            setBusy(true);
            try {
              setText(await file.text());
            } catch {
              setMessage(labels.csvError);
            } finally {
              setBusy(false);
            }
          }}
        />
      </Text>
      <Button
        highContrast
        disabled={!text || busy}
        type="button"
        onClick={async () => {
          setBusy(true);
          try {
            setPreview(await previewImportAction(upload(text)));
          } catch {
            setMessage(labels.csvError);
          } finally {
            setBusy(false);
          }
        }}
      >
        {labels.preview}
      </Button>
      <Text role="status">{message}</Text>
      {preview ? (
        <form
          action={async (data) => {
            setBusy(true);
            try {
              const mappings = Object.fromEntries(
                preview.unknown.map((name, i) => [
                  name,
                  String(data.get(`mapping-${i}`) ?? ""),
                ]),
              );
              const result = await confirmImportAction(upload(text, mappings));
              setMessage(
                `${labels.imported}: ${result.imported}. ${labels.skipped}: ${result.skipped}.`,
              );
              setPreview(undefined);
            } catch {
              setMessage(labels.saveFailed);
            } finally {
              setBusy(false);
            }
          }}
          className="form-grid"
        >
          <Text>
            {labels.rows}: {preview.rows}. {labels.workouts}: {preview.workouts}
            . {labels.skipped}: {preview.duplicates}.
          </Text>
          {preview.errors.map((error) => (
            <Text key={error} role="alert">
              {labels.csvRowError.replace("{row}", String(error))}
            </Text>
          ))}
          {preview.unknown.map((name, i) => (
            <Text as="label" key={name}>
              {labels.mapping}: {name}
              <FormSelect
                name={`mapping-${i}`}
                label={`${labels.mapping}: ${name}`}
                options={[
                  { value: "unmapped", label: labels.mapping },
                  { value: "create", label: labels.createUnknown },
                  ...preview.exercises.map((e) => ({
                    value: e.id,
                    label: e.name,
                  })),
                ]}
              />
            </Text>
          ))}
          <Button
            highContrast
            type="submit"
            disabled={busy || preview.errors.length > 0}
          >
            {labels.confirmImport}
          </Button>
          <Button
            highContrast
            type="button"
            variant="soft"
            disabled={busy}
            onClick={() => {
              setPreview(undefined);
              setText("");
            }}
          >
            {labels.cancel}
          </Button>
        </form>
      ) : null}
    </Card>
  );
}
