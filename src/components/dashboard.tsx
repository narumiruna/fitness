import { ActivityLogIcon } from "@radix-ui/react-icons";
import { Card, Heading, Text } from "@radix-ui/themes";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <Heading as="h1" size="8">
          {title}
        </Heading>
        <Text as="p" size="3" color="gray">
          {description}
        </Text>
      </div>
      {children}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <Card asChild>
      <article className="stats-card">
        <span className="metric-icon">
          <ActivityLogIcon aria-hidden="true" />
        </span>
        <div>
          <Text as="p" size="2" color="gray">
            {label}
          </Text>
          <Text as="p" size="6" weight="bold">
            {value}
          </Text>
          {detail ? (
            <Text as="p" size="1" color="gray">
              {detail}
            </Text>
          ) : null}
        </div>
      </article>
    </Card>
  );
}

export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Text as="p" weight="bold">
        {title}
      </Text>
      {description ? (
        <Text as="p" size="2" color="gray">
          {description}
        </Text>
      ) : null}
      {children}
    </div>
  );
}
