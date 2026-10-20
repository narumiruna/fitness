import type { Bootstrap } from "@narumitw/fitness-contracts";
import { createContext, useContext } from "react";

export const SessionContext = createContext<Bootstrap | null>(null);
export function useSession(): Bootstrap {
  const session = useContext(SessionContext);
  if (!session) throw new Error("Session is not ready");
  return session;
}
