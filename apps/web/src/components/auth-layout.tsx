import {
  ActivityLogIcon,
  BarChartIcon,
  CheckCircledIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import { Card, Heading, Text } from "@radix-ui/themes";
import type { ReactNode } from "react";
import { useDictionary } from "@/lib/i18n";

type AuthLayoutProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
};

export function AuthLayout({
  eyebrow,
  title,
  description,
  children,
}: AuthLayoutProps) {
  const t = useDictionary();
  const steps = [
    {
      icon: CheckCircledIcon,
      title: t("authRecordTitle"),
      description: t("authRecordDescription"),
    },
    {
      icon: BarChartIcon,
      title: t("authReviewTitle"),
      description: t("authReviewDescription"),
    },
    {
      icon: ReloadIcon,
      title: t("authRepeatTitle"),
      description: t("authRepeatDescription"),
    },
  ];

  return (
    <section className="auth-layout" aria-labelledby="auth-title">
      <Card className="auth-card">
        <header className="auth-card-header">
          <Text as="p" className="auth-card-eyebrow">
            {eyebrow}
          </Text>
          <Heading as="h1" id="auth-title" className="auth-title">
            {title}
          </Heading>
          <Text as="p" className="auth-card-description">
            {description}
          </Text>
        </header>
        <div className="auth-card-content">{children}</div>
      </Card>
      <aside className="auth-promise" aria-labelledby="auth-promise-title">
        <p className="auth-eyebrow">
          <ActivityLogIcon aria-hidden="true" />
          {t("authPromoEyebrow")}
        </p>
        <h2 id="auth-promise-title">
          {t("authPromoTitle")}
          <span>{t("authPromoTitleAccent")}</span>
        </h2>
        <p className="auth-description">{t("authPromoDescription")}</p>
        <ul className="auth-workflow">
          {steps.map(
            ({ icon: Icon, title: stepTitle, description: detail }) => (
              <li key={stepTitle}>
                <span className="auth-workflow-icon">
                  <Icon aria-hidden="true" />
                </span>
                <div>
                  <p className="auth-workflow-title">{stepTitle}</p>
                  <p className="auth-workflow-description">{detail}</p>
                </div>
              </li>
            ),
          )}
        </ul>
      </aside>
    </section>
  );
}
