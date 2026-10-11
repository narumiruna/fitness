"use client";

import { BarChartIcon, CalendarIcon, ReaderIcon } from "@radix-ui/react-icons";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { StrengthIcon } from "@/components/dashboard";

export function Navigation({
  labels,
  label,
}: {
  labels: string[];
  label: string;
}) {
  const pathname = usePathname();
  const items = [
    { href: "/workouts", Icon: StrengthIcon },
    { href: "/calendar", Icon: CalendarIcon },
    { href: "/stats", Icon: BarChartIcon },
    { href: "/exercises", Icon: ReaderIcon },
    { href: "/measurements", Icon: BarChartIcon },
    { href: "/data", Icon: ReaderIcon },
  ];
  return (
    <nav className="primary-nav" aria-label={label}>
      {items.map(({ href, Icon }, index) => (
        <NextLink
          key={href}
          href={href}
          className={index > 3 ? "utility-nav-link" : undefined}
          aria-current={
            pathname === href || pathname.startsWith(`${href}/`)
              ? "page"
              : undefined
          }
        >
          <Icon aria-hidden="true" />
          {labels[index]}
        </NextLink>
      ))}
    </nav>
  );
}
