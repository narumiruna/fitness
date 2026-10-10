import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions/auth";
import { getCurrentUser, hasUsers } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!(await hasUsers())) {
    redirect("/setup");
  }

  if (await getCurrentUser()) {
    redirect("/workouts");
  }

  const t = await getDictionary();
  const params = await searchParams;
  const isDevelopment = process.env.NODE_ENV === "development";

  return (
    <section className="narrow stack">
      <div className="page-header">
        <div>
          <h1>{t("loginTitle")}</h1>
        </div>
      </div>
      <form className="panel form-grid" action={loginAction}>
        {params.error ? <p className="error">{t("loginError")}</p> : null}
        <label>
          {t("username")}
          <input
            autoComplete="username"
            defaultValue={isDevelopment ? "admin" : ""}
            name="username"
            required
          />
        </label>
        <label>
          {t("password")}
          <input
            autoComplete="current-password"
            defaultValue={isDevelopment ? "admin" : ""}
            name="password"
            required
            type="password"
          />
        </label>
        <button className="button" type="submit">
          {t("signIn")}
        </button>
      </form>
    </section>
  );
}
