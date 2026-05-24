import { createUserAction } from "@/app/actions/users";
import { requireAdmin } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

export default async function UsersPage() {
  await requireAdmin();
  const t = await getDictionary();
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
  });

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <h1>{t("users")}</h1>
        </div>
      </div>
      <div className="grid">
        <form className="panel form-grid" action={createUserAction}>
          <h2>{t("createUser")}</h2>
          <label>
            {t("username")}
            <input name="username" required />
          </label>
          <label>
            {t("password")}
            <input name="password" required type="password" />
          </label>
          <label>
            {t("role")}
            <select name="role">
              <option value="USER">USER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </label>
          <button className="button" type="submit">
            {t("createUser")}
          </button>
        </form>
        <div className="panel">
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("username")}</th>
                  <th>{t("role")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.username}</td>
                    <td>{user.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
