import { Button, Card, Heading, Text } from "@radix-ui/themes";
import { useRef, useState } from "react";
import { confirmImportAction, previewImportAction } from "@/api/actions";
import { ActionForm } from "@/components/action-form";
import { FormSelect } from "./form-select";

function upload(text: string, mappings: Record<string, string> = {}) {
  const data = new FormData();
  data.set("file", new File([text], "workouts.csv", { type: "text/csv" }));
  data.set("mappings", JSON.stringify(mappings));
  return data;
}
export function DataImport({ labels }: { labels: Record<string, string> }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [preview, setPreview] =
    useState<Awaited<ReturnType<typeof previewImportAction>>>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Card className="stack" aria-busy={busy}>
      <Heading as="h3" size="4">
        {preview ? labels.importReviewStep : labels.importSelectStep}
      </Heading>
      <Text as="label">
        {labels.file}
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          disabled={busy || !!preview}
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
      {!preview ? (
        <Button
          highContrast
          disabled={!text || busy}
          aria-label={labels.preview}
          loading={busy}
          type="button"
          onClick={async () => {
            setBusy(true);
            setMessage("");
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
      ) : null}
      <Text role="status">{message}</Text>
      {preview ? (
        <ActionForm
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
              setText("");
              if (fileInput.current) fileInput.current.value = "";
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
            aria-label={labels.confirmImport}
            loading={busy}
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
              setMessage("");
            }}
          >
            {labels.cancel}
          </Button>
        </ActionForm>
      ) : null}
    </Card>
  );
}
