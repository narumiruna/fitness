import {
  BarChartIcon,
  CalendarIcon,
  ReaderIcon,
  StackIcon,
} from "@radix-ui/react-icons";
import { Card, Heading, Text } from "@radix-ui/themes";
import type { ReactNode } from "react";

export function StrengthIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 12h10M2 10v4m20-4v4" />
      <rect x="4" y="6" width="3" height="12" rx="1" />
      <rect x="17" y="6" width="3" height="12" rx="1" />
    </svg>
  );
}

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
  icon = "activity",
}: {
  label: string;
  value: string;
  detail?: string;
  icon?: "activity" | "volume" | "sets" | "calendar" | "library";
}) {
  const Icon = {
    activity: StrengthIcon,
    volume: StackIcon,
    sets: BarChartIcon,
    calendar: CalendarIcon,
    library: ReaderIcon,
  }[icon];
  return (
    <Card asChild>
      <article className="stats-card">
        <span className="metric-icon">
          <Icon aria-hidden="true" />
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
