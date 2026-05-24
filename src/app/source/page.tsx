import { getDictionary } from "@/lib/i18n";

export default async function SourcePage() {
  const t = await getDictionary();

  return (
    <section className="narrow stack">
      <div className="page-header">
        <div>
          <h1>{t("sourceLicense")}</h1>
          <p>{t("sourceLicenseBody")}</p>
        </div>
      </div>
    </section>
  );
}
