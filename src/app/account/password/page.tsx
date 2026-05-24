import { changePasswordAction } from "@/app/actions/auth";
import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ changed?: string; error?: string }>;
}) {
  await requireUser();
  const t = await getDictionary();
  const params = await searchParams;

  return (
    <section className="narrow stack">
      <div className="page-header">
        <div>
          <h1>{t("changePassword")}</h1>
        </div>
      </div>
      <form className="panel form-grid" action={changePasswordAction}>
        {params.changed ? (
          <p className="muted">{t("passwordChanged")}</p>
        ) : null}
        {params.error ? (
          <p className="error">{t("changePasswordError")}</p>
        ) : null}
        <label>
          {t("currentPassword")}
          <input
            autoComplete="current-password"
            name="currentPassword"
            required
            type="password"
          />
        </label>
        <label>
          {t("newPassword")}
          <input
            autoComplete="new-password"
            minLength={8}
            name="newPassword"
            required
            type="password"
          />
        </label>
        <label>
          {t("confirmPassword")}
          <input
            autoComplete="new-password"
            minLength={8}
            name="confirmPassword"
            required
            type="password"
          />
        </label>
        <button className="button" type="submit">
          {t("changePassword")}
        </button>
      </form>
    </section>
  );
}
