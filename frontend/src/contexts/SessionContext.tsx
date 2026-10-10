import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { DemoSession } from "../services/demoSession";
const SessionContext = createContext<DemoSession | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session] = useState(() => new DemoSession());
  useEffect(() => () => session.dispose(), [session]);
  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}
export function useSession() {
  const service = useContext(SessionContext);
  if (!service) throw new Error("SessionProvider is required");
  const session = useSyncExternalStore(service.subscribe, service.getSnapshot);
  return { session, service };
}
