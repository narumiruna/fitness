import {
  ArchiveIcon,
  BarChartIcon,
  CalendarIcon,
  ReaderIcon,
  RulerSquareIcon,
} from "@radix-ui/react-icons";
import { useEffect, useRef } from "react";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { StrengthIcon } from "@/components/dashboard";
import { useDictionary } from "@/lib/i18n";
import { AccountMenu } from "./account-menu";

export function Navigation({
  labels,
  label,
}: {
  labels: string[];
  label: string;
}) {
  const { pathname } = useLocation();
  const t = useDictionary();
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = navigation.current;
    if (!element) return;
    const updateHeight = () => {
      document.documentElement.style.setProperty(
        "--fitness-navigation-height",
        `${element.getBoundingClientRect().height}px`,
      );
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty(
        "--fitness-navigation-height",
      );
    };
  }, []);
  const items = [
    { href: "/workouts", Icon: StrengthIcon },
    { href: "/calendar", Icon: CalendarIcon },
    { href: "/stats", Icon: BarChartIcon },
    { href: "/exercises", Icon: ReaderIcon },
    { href: "/measurements", Icon: RulerSquareIcon },
    { href: "/data", Icon: ArchiveIcon },
  ];
  return (
    <nav ref={navigation} className="primary-nav" aria-label={label}>
      <span className="navigation-heading">{t("trainingWorkspace")}</span>
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
          <span>{labels[index]}</span>
        </RouterLink>
      ))}
      <AccountMenu />
    </nav>
  );
}
