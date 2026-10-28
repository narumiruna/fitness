import { bootstrapSchema } from "@narumitw/fitness-contracts";
import { ExitIcon, PersonIcon } from "@radix-ui/react-icons";
import {
  Box,
  Button,
  Flex,
  Link,
  Spinner,
  Text,
  Theme,
} from "@radix-ui/themes";
import { useQuery } from "@tanstack/react-query";
import {
  Component,
  type ErrorInfo,
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Navigate,
  Outlet,
  Route,
  Link as RouterLink,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { logoutAction } from "./api/actions";
import {
  clearPrivateState,
  HttpError,
  queryClient,
  request,
} from "./api/client";
import { AccountMenu } from "./components/account-menu";
import { ActionForm } from "./components/action-form";
import { StrengthIcon } from "./components/dashboard";
import { LanguageSelect } from "./components/language-select";
import { Navigation } from "./components/navigation";
import {
  PageError,
  PageErrorMessagesProvider,
  PageUnavailable,
} from "./components/page-error";
import { useDictionary } from "./lib/i18n";
import { SessionContext, useSession } from "./lib/session";
import { dictionary } from "./lib/translations";

const CalendarPage = lazy(() => import("./pages/calendar"));
const ConnectionsPage = lazy(() => import("./pages/connections"));
const McpConsentPage = lazy(() => import("./pages/mcp-consent"));
const DataPage = lazy(() => import("./pages/data"));
const ExercisePage = lazy(() => import("./pages/exercise"));
const ExercisesPage = lazy(() => import("./pages/exercises"));
const LoginPage = lazy(() => import("./pages/login"));
const MeasurementsPage = lazy(() => import("./pages/measurements"));
const NewPage = lazy(() => import("./pages/new"));
const PasskeysPage = lazy(() => import("./pages/passkeys"));
const PasswordPage = lazy(() => import("./pages/password"));
const SetupPage = lazy(() => import("./pages/setup"));
const SourcePage = lazy(() => import("./pages/source"));
const StatsPage = lazy(() => import("./pages/stats"));
const UsersPage = lazy(() => import("./pages/users"));
const WorkoutPage = lazy(() => import("./pages/workout"));
const WorkoutsPage = lazy(() => import("./pages/workouts"));

export function App() {
  const [epoch, setEpoch] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const consentReturn = useRef<{ path: string; arrived: boolean } | null>(null);
  const previousUser = useRef<string | null | undefined>(undefined);
  const bootstrap = useQuery({
    queryKey: ["bootstrap", epoch],
    queryFn: ({ signal }) =>
      request("/api/bootstrap", bootstrapSchema, { signal }),
  });
  useEffect(() => {
    if (location.pathname === "/login") {
      const state: unknown = location.state;
      if (state && typeof state === "object" && "mcpConsentRequest" in state) {
        const id = state.mcpConsentRequest;
        consentReturn.current =
          typeof id === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(id)
            ? { path: `/oauth/consent?request=${id}`, arrived: false }
            : null;
      }
    } else if (location.pathname === "/workouts") {
      if (bootstrap.data?.user && consentReturn.current) {
        if (consentReturn.current.arrived) consentReturn.current = null;
        else {
          consentReturn.current.arrived = true;
          navigate(consentReturn.current.path, { replace: true });
        }
      }
    } else if (
      `${location.pathname}${location.search}` !== consentReturn.current?.path
    )
      consentReturn.current = null;
  }, [location, bootstrap.data?.user, navigate]);
  useEffect(() => {
    const clear = () => {
      previousUser.current = undefined;
      setEpoch((value) => value + 1);
    };
    const expired = () => navigate("/login", { replace: true });
    const redirect = (event: Event) => {
      let destination = (event as CustomEvent<string>).detail;
      // Login actions can finish after the authenticated route gate has run.
      if (destination === "/workouts" && consentReturn.current) {
        destination = consentReturn.current.path;
        consentReturn.current = null;
      } else if (destination === "/login") consentReturn.current = null;
      navigate(destination);
    };
    window.addEventListener("fitness:clear-drafts", clear);
    window.addEventListener("fitness:expired", expired);
    window.addEventListener("fitness:navigate", redirect);
    return () => {
      window.removeEventListener("fitness:clear-drafts", clear);
      window.removeEventListener("fitness:expired", expired);
      window.removeEventListener("fitness:navigate", redirect);
    };
  }, [navigate]);
  useEffect(() => {
    if (!bootstrap.data) return;
    document.documentElement.lang = bootstrap.data.locale;
    const id = bootstrap.data.user?.id ?? null;
    if (previousUser.current !== undefined && previousUser.current !== id) {
      previousUser.current = id;
      clearPrivateState();
    } else previousUser.current = id;
  }, [bootstrap.data]);
  if (bootstrap.isPending)
    return (
      <div className="bootstrap-status" role="progressbar" aria-label="Fitness">
        <Spinner size="3" />
      </div>
    );
  if (bootstrap.isError)
    return (
      <div className="bootstrap-status">
        <Text role="alert">
          {dictionary("en")("bootstrapError")}{" "}
          {dictionary("zh-TW")("bootstrapError")}
        </Text>
        <Button
          onClick={() => {
            void bootstrap.refetch();
          }}
        >
          {dictionary("en")("bootstrapRetry")} /{" "}
          {dictionary("zh-TW")("bootstrapRetry")}
        </Button>
      </div>
    );
  return (
    <SessionContext.Provider value={bootstrap.data}>
      <Theme
        accentColor="teal"
        grayColor="slate"
        appearance="light"
        radius="medium"
      >
        <Routes>
          <Route
            element={
              <Shell key={`${bootstrap.data.user?.id ?? "guest"}:${epoch}`} />
            }
          >
            <Route index element={<Home />} />
            <Route
              path="setup"
              element={
                <PublicGate setup>
                  <SetupPage />
                </PublicGate>
              }
            />
            <Route
              path="login"
              element={
                <PublicGate>
                  <LoginPage />
                </PublicGate>
              }
            />
            <Route path="source" element={<SourcePage />} />
            <Route path="oauth/consent" element={<McpConsentPage />} />
            <Route element={<ProtectedGate />}>
              <Route path="workouts" element={<WorkoutsPage />} />
              <Route path="workouts/new" element={<NewPage />} />
              <Route path="workouts/:id" element={<WorkoutPage />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="stats" element={<StatsPage />} />
              <Route path="exercises" element={<ExercisesPage />} />
              <Route path="exercises/:id" element={<ExercisePage />} />
              <Route path="measurements" element={<MeasurementsPage />} />
              <Route path="data" element={<DataPage />} />
              <Route path="account/password" element={<PasswordPage />} />
              <Route path="account/passkeys" element={<PasskeysPage />} />
              <Route path="account/connections" element={<ConnectionsPage />} />
              <Route path="admin/users" element={<UsersPage />} />
            </Route>
            <Route path="*" element={<MissingPage />} />
          </Route>
        </Routes>
      </Theme>
    </SessionContext.Provider>
  );
}

function Home() {
  const { hasUsers, user } = useSession();
  return (
    <Navigate
      replace
      to={!hasUsers ? "/setup" : user ? "/workouts" : "/login"}
    />
  );
}
function PublicGate({
  children,
  setup = false,
}: {
  children: ReactNode;
  setup?: boolean;
}) {
  const { hasUsers, user } = useSession();
  if (setup && hasUsers) return <Navigate replace to="/login" />;
  if (!setup && !hasUsers) return <Navigate replace to="/setup" />;
  if (user) return <Navigate replace to="/workouts" />;
  return children;
}
function ProtectedGate() {
  const { hasUsers, user } = useSession();
  const location = useLocation();
  if (user && user.role !== "ADMIN" && location.pathname === "/admin/users")
    return <Navigate replace to="/workouts" />;
  return user ? (
    <Outlet />
  ) : (
    <Navigate replace to={hasUsers ? "/login" : "/setup"} />
  );
}
function MissingPage() {
  return <PageUnavailable />;
}

function hashTarget(hash: string) {
  try {
    return document.getElementById(decodeURIComponent(hash.slice(1)));
  } catch {
    return null;
  }
}

function Shell() {
  const { user, locale } = useSession();
  const t = useDictionary();
  const location = useLocation();
  const consentIds =
    location.pathname === "/oauth/consent"
      ? new URLSearchParams(location.search).getAll("request")
      : [];
  const previousNavigation = useRef(location);
  useLayoutEffect(() => {
    const previous = previousNavigation.current;
    if (previous.key === location.key) return;
    previousNavigation.current = location;
    if (location.hash) {
      requestAnimationFrame(() => hashTarget(location.hash)?.scrollIntoView());
    } else {
      window.scrollTo(0, 0);
      // Same-page mutation redirects must not take focus from a control the
      // user selected while the refreshed data was arriving.
      if (previous.pathname !== location.pathname)
        document.getElementById("main-content")?.focus({ preventScroll: true });
    }
  }, [location]);
  return (
    <Box className="shell">
      <a className="skip-link" href="#main-content">
        {t("skipToContent")}
      </a>
      <Flex asChild align="center" justify="between" gap="4" className="topbar">
        <header>
          <Link highContrast asChild weight="bold" size="4">
            <RouterLink className="brand" to="/">
              <StrengthIcon />
              {t("appName")}
            </RouterLink>
          </Link>
          {user ? (
            <Navigation
              label={t("primaryNavigation")}
              labels={[
                t("workouts"),
                t("calendar"),
                t("stats"),
                t("exercises"),
                t("measurements"),
                t("dataTransfer"),
              ]}
            />
          ) : null}
          <Flex asChild align="center" wrap="wrap" gap="3">
            <nav className="secondary-nav" aria-label={t("account")}>
              <LanguageSelect
                locale={locale}
                label={t("language")}
                errorMessage={t("languageChangeError")}
              />
              {user ? (
                <>
                  <Flex
                    align="center"
                    gap="3"
                    className="desktop-account-actions"
                  >
                    {user.role === "ADMIN" ? (
                      <Link highContrast asChild>
                        <RouterLink to="/admin/users">{t("admin")}</RouterLink>
                      </Link>
                    ) : null}
                    <Link highContrast asChild>
                      <RouterLink to="/account/password">
                        <PersonIcon aria-hidden="true" />
                        {t("account")}
                      </RouterLink>
                    </Link>
                    <ActionForm action={logoutAction}>
                      <Button highContrast variant="ghost" type="submit">
                        <ExitIcon aria-hidden="true" />
                        {t("signOut")}
                      </Button>
                    </ActionForm>
                  </Flex>
                  <AccountMenu />
                </>
              ) : (
                <Link highContrast asChild>
                  <RouterLink
                    to="/login"
                    state={
                      consentIds.length === 1
                        ? { mcpConsentRequest: consentIds[0] }
                        : undefined
                    }
                  >
                    {t("signIn")}
                  </RouterLink>
                </Link>
              )}
            </nav>
          </Flex>
        </header>
      </Flex>
      <Box asChild className="main">
        <main id="main-content" tabIndex={-1}>
          <PageErrorMessagesProvider
            message={t("pageError")}
            retry={t("tryAgain")}
            title={t("pageLoadErrorTitle")}
          >
            <PageBoundary key={location.pathname}>
              <Suspense
                fallback={
                  <div role="status">
                    <Spinner /> {t("loading")}
                  </div>
                }
              >
                <Outlet />
                <HashNavigation key={location.key} />
              </Suspense>
            </PageBoundary>
          </PageErrorMessagesProvider>
        </main>
      </Box>
    </Box>
  );
}

function HashNavigation() {
  const location = useLocation();
  useEffect(() => {
    if (!location.hash) return;
    hashTarget(location.hash)?.scrollIntoView();
  }, [location.hash]);
  return null;
}

class PageBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* Do not log private page data. */
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const status = error instanceof HttpError ? error.status : 0;
    if (status === 403 || status === 404)
      return <PageUnavailable forbidden={status === 403} />;
    return (
      <PageError
        onRetry={async () => {
          await queryClient.resetQueries({ queryKey: ["view"] });
          this.setState({ error: null }, () => {
            document
              .getElementById("main-content")
              ?.focus({ preventScroll: true });
          });
        }}
      />
    );
  }
}
