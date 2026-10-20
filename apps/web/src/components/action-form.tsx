import { Text } from "@radix-ui/themes";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { formFailureSchema } from "@/api/actions";
import { HttpError } from "@/api/client";
import { useDictionary } from "@/lib/i18n";

export const FormPendingContext = createContext(false);
export function useFormPending() {
  return useContext(FormPendingContext);
}
export type ActionFormProps = Omit<
  ComponentProps<"form">,
  "action" | "children"
> & {
  action?: string | ((data: FormData) => unknown | Promise<unknown>);
  children?: ReactNode;
  resetOnSuccess?: boolean;
};

// Native validation and submitter values run before this handler. Failed requests never reset drafts.
export function ActionForm({
  action,
  children,
  onSubmit,
  resetOnSuccess = false,
  ...props
}: ActionFormProps) {
  const navigate = useNavigate();
  const t = useDictionary();
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <FormPendingContext.Provider value={pending}>
      <form
        {...props}
        aria-busy={pending}
        onSubmit={async (event) => {
          onSubmit?.(event);
          if (event.defaultPrevented) return;
          event.preventDefault();
          if (inFlight.current) return;
          const form = event.currentTarget;
          const data = new FormData(
            form,
            (event.nativeEvent as SubmitEvent).submitter,
          );
          if (typeof action === "string") {
            const search = new URLSearchParams();
            for (const [name, value] of data)
              if (typeof value === "string") search.append(name, value);
            navigate(`${action}?${search}`);
            return;
          }
          if (!action) return;
          inFlight.current = true;
          setPending(true);
          setMessage("");
          try {
            const result = await action(data);
            const failure = formFailureSchema.safeParse(result);
            setMessage(failure.success ? t(failure.data.error) : "");
            if (!failure.success && resetOnSuccess) form.reset();
          } catch (error) {
            setMessage(
              error instanceof HttpError && error.status === 409
                ? t("sessionConflict")
                : t("saveFailed"),
            );
          } finally {
            inFlight.current = false;
            setPending(false);
          }
        }}
      >
        <fieldset disabled={pending} className="form-fields">
          {children}
        </fieldset>
        {message ? (
          <Text role="alert" size="2">
            {message}
          </Text>
        ) : null}
      </form>
    </FormPendingContext.Provider>
  );
}
