import { BarChartIcon, CalendarIcon, ReaderIcon } from "@radix-ui/react-icons";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { StrengthIcon } from "@/components/dashboard";

export function Navigation({
  labels,
  label,
}: {
  labels: string[];
  label: string;
}) {
  const { pathname } = useLocation();
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
        <RouterLink
          key={href}
          to={href}
          className={index > 3 ? "utility-nav-link" : undefined}
          aria-current={
            pathname === href || pathname.startsWith(`${href}/`)
              ? "page"
              : undefined
          }
        >
          <Icon aria-hidden="true" />
          {labels[index]}
        </RouterLink>
      ))}
    </nav>
  );
}
