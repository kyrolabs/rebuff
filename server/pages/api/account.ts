import { NextApiRequest, NextApiResponse } from "next";
import Cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { createServerSupabaseClient } from "@supabase/auth-helpers-nextjs";
import { AppState } from "@/interfaces/ui";

const supabaseAdminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_KEY || ""
);

const cors = Cors({
  methods: ["POST", "GET", "HEAD"],
});

function generateApiKey(length: number = 64): string {
  const apiKey = randomBytes(length).toString("hex");
  return apiKey;
}

function runMiddleware(
  req: NextApiRequest,
  res: NextApiResponse,
  fn: Function
) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: any) => {
      if (result instanceof Error) {
        return reject(result);
      }

      return resolve(result);
    });
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<any>
) {
  await runMiddleware(req, res, cors);
  if (!["POST", "GET"].includes(req.method || "")) {
    return res
      .status(405)
      .json({ error: "not_allowed", message: "Method not allowed" });
  }
  // Create authenticated Supabase Client
  const supabase = createServerSupabaseClient({ req, res });

  // Check if we have a session
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // If no session, return not authenticated
  if (!session) {
    return res
      .status(401)
      .json({ error: "not_authenticated", message: "not authenticated" });
  }
  // Get user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If user is null, return not authenticated
  if (!user) {
    return res
      .status(401)
      .json({ error: "not_authenticated", message: "not authenticated" });
  }

  if (req.method === "GET" && !req.query.slug) {
    // check if a valid row exists in the accounts table and credits table
    try {
      const appState = await getAppStateFromDb(user);
      return res.status(200).json(appState);
    } catch (error) {
      console.error(error);
      return res
        .status(500)
        .json({ error: "server_error", message: "something went wrong" });
    }
  } else if (
    req.method === "POST" &&
    req.query.slug &&
    Array.isArray(req.query.slug) &&
    req.query.slug.length === 1 &&
    req.query.slug[0] === "apikey"
  ) {
    const apikey = generateApiKey();
    return res.status(200).json({ apikey });
  }
  return res.status(404);
}
const getAppStateForUser = async (user: any): Promise<AppState> => {
  const appState = {} as AppState;
  const { data, error } = await supabaseAdminClient
    .from("accounts")
    .select("apikey")
    .eq("id", user.id)
    .single();
  if (error) {
    console.error(`Error getting account for user ${user.id}`);
    console.error(error);
  }
  if (!Array.isArray(data) || !data[0].apikey) {
    throw new Error("No account found");
  }
  if (Array.isArray(data[0].credits) || !data[0].credits) {
    throw new Error("No credits found");
  }
  appState.apikey = data[0].apikey;
  appState.credits = data[0].credits.total_credits_cents;
  return appState;
};
const getAppStateFromDb = async (user: any): Promise<AppState> => {
  let appState = {} as AppState;
  try {
    appState = await getAppStateForUser(user);
    return appState;
  } catch (error) {
    console.error(error);
  }
  // if not found, create a new row in the accounts table and credits table
  const { error: accountsErr } = await supabaseAdminClient
    .from("accounts")
    .insert([{ id: user.id, apikey: generateApiKey(), name: user.email }])
    .select();
  if (accountsErr) {
    console.error(accountsErr);
    throw new Error("Error creating account");
  }
  const { error: creditsErr } = await supabaseAdminClient
    .from("credits")
    .upsert(
      { id: user.id, total_credits_cents: 1000 },
      { onConflict: "id", ignoreDuplicates: true }
    );
  if (creditsErr) {
    console.error(creditsErr);
    throw new Error("Error creating credits");
  }
  return await getAppStateForUser(user);
};
