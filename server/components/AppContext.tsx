import { AppState, AppStateCtx, Attempt, PromptRequest } from "@/interfaces/ui";
import React, {
  createContext,
  useState,
  FC,
  ReactNode,
  useEffect,
} from "react";
import { useSession, useSupabaseClient } from "@supabase/auth-helpers-react";
import fetch from "node-fetch";
import { DetectApiSuccessResponse } from "@/lib/rebuff";

const initState = {
  apikey: "",
  credits: 0,
  promptLoading: false,
  accountLoading: false,
  stats: {
    last24h: {
      attempts: 0,
      breaches: 0,
    },
    last7d: {
      attempts: 0,
      breaches: 0,
    },
    alltime: {
      attempts: 0,
      breaches: 0,
    },
  },
} as AppState;
// Create a context object
export const AppContext = createContext<AppStateCtx>({
  appState: initState,
  promptLoading: false,
  accountLoading: false,
  attempts: [] as Attempt[],
  refreshAppState: async () => undefined,
  refreshApikey: async () => undefined,
  submitPrompt: async (prompt: PromptRequest) => undefined,
  setPromptLoading: () => null,
});

// Create a provider component
export const AppProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [appState, setAppState] = useState<AppState>(initState);
  const [promptLoading, setPromptLoading] = useState<boolean>(false);
  const [accountLoading, setAccountLoading] = useState<boolean>(false);
  const [attempts, setAttempts] = useState<Attempt[]>([] as Attempt[]);
  const session = useSession();
  const supabase = useSupabaseClient();
  useEffect(
    function onChange() {
      if (session) {
        refreshAppState();
      }
    },
    [session]
  );
  const refreshAppState = async () => {
    setAccountLoading(true);
    try {
      const response = await fetch("/api/account");
      const data = (await response.json()) as AppState;
      setAppState(data);
    } catch (error) {
      console.error(error);
    } finally {
      setAccountLoading(false);
    }
  };
  const refreshApikey = async () => {
    setPromptLoading(true);
    try {
      const response = await fetch("/api/account/apikey", {
        method: "POST",
      });
      const data = await response.json();
      setApikey(data.apikey);
    } catch (error) {
      console.error(error);
    } finally {
      setPromptLoading(false);
    }
  };
  const submitPrompt = async (prompt: PromptRequest) => {
    setPromptLoading(true);
    try {
      const body = JSON.stringify(prompt);

      const response = await fetch("/api/playground", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body,
      });

      const data = await response.json();
      const {
        metrics = {
          runHeuristicCheck: false,
          runLanguageModelCheck: false,
          runVectorCheck: false,
          vectorScore: {},
          heuristicScore: 0,
          modelScore: 0,
          maxHeuristicScore: 0,
          maxModelScore: 0,
          maxVectorScore: 0,
        } as DetectApiSuccessResponse,
        is_injection = false,
        output = "",
        canary_word = "",
        canary_word_leaked,
      } = data;

      setAttempts((prev) => [
        ...prev,
        {
          error: null,
          timestamp: new Date(),
          input: prompt.userInput || "",
          metrics,
          is_injection,
          output: output || "",
          canary_word,
          canary_word_leaked,
        },
      ]);
    } catch (error: any) {
      setAttempts((prev) => [
        {
          error,
          timestamp: new Date(),
          input: prompt.userInput || "",
          metrics: {
            runHeuristicCheck: false,
            runLanguageModelCheck: false,
            runVectorCheck: false,
            vectorScore: {},
            heuristicScore: 0,
            modelScore: 0,
            maxHeuristicScore: 0,
            maxModelScore: 0,
            maxVectorScore: 0,
          },
          is_injection: false,
          output: "",
          canary_word: "",
          canary_word_leaked: false,
        },
        ...prev,
      ]);
    } finally {
      setPromptLoading(false);
    }
  };

  const setApikey = (apikey: string) => {
    setAppState((prev) => ({ ...prev, apikey: apikey }));
  };

  const setCredits = (credits: number) => {
    setAppState((prev) => ({ ...prev, credits: credits }));
  };

  const setStats = (stats: any) => {
    setAppState((prev) => ({ ...prev, stats: stats }));
  };

  return (
    <AppContext.Provider
      value={{
        appState,
        promptLoading: promptLoading,
        accountLoading,
        attempts,
        refreshAppState,
        refreshApikey,
        submitPrompt,
        setPromptLoading: setPromptLoading,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
