import { redirect } from "next/navigation";
import { setupAdminAction } from "@/app/actions/auth";
import { hasUsers } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";

export default async function SetupPage() {
  if (await hasUsers()) {
    redirect("/login");
  }

  const t = await getDictionary();

  return (
    <section className="narrow stack">
      <div className="page-header">
        <div>
          <h1>{t("setupTitle")}</h1>
          <p>{t("setupIntro")}</p>
        </div>
      </div>
      <form className="panel form-grid" action={setupAdminAction}>
        <label>
          {t("username")}
          <input autoComplete="username" name="username" required />
        </label>
        <label>
          {t("password")}
          <input
            autoComplete="new-password"
            name="password"
            required
            type="password"
          />
        </label>
        <button className="button" type="submit">
          {t("createAdmin")}
        </button>
      </form>
    </section>
  );
}
