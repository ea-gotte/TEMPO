import { createContext, useContext } from "react";
import type { WorkEnv } from "./types";

const Ctx = createContext<WorkEnv | null>(null);
export const EnvProvider = Ctx.Provider;

export function useEnv(): WorkEnv {
  const v = useContext(Ctx);
  if (!v) throw new Error("useEnv fuera de <EnvProvider>");
  return v;
}
