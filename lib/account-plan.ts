import type sql from "mssql";
import { isUnlimitedEmail, UNLIMITED_LIMIT } from "@/lib/plan-overrides";

export type AccountType = "single" | "multi";
export type PlanType = "basic" | "business_pro" | "business_scale";

type UserPlanRow = {
  account_type: string | null;
  plan_type?: string | null;
  email?: string | null;
};

export type PlanLimits = {
  accountType: AccountType;
  planType: PlanType;
  maxRfcs: number;
  maxMembers: number;
};

function normalizeAccountType(value: string | null | undefined): AccountType {
  return value === "multi" ? "multi" : "single";
}

function normalizePlanType(value: string | null | undefined): PlanType {
  if (value === "business_pro" || value === "business_scale") return value;
  return "basic";
}

export function resolvePlanLimits(rawAccountType: string | null | undefined, rawPlanType: string | null | undefined): PlanLimits {
  const accountType = normalizeAccountType(rawAccountType);
  const planType = normalizePlanType(rawPlanType);

  if (accountType === "single") {
    return {
      accountType,
      planType: "basic",
      maxRfcs: 1,
      maxMembers: 0,
    };
  }

  if (planType === "business_scale") {
    return {
      accountType,
      planType,
      maxRfcs: 20,
      maxMembers: 20,
    };
  }

  if (planType === "business_pro") {
    return {
      accountType,
      planType,
      maxRfcs: 5,
      maxMembers: 5,
    };
  }

  return {
    accountType,
    planType: "basic",
    maxRfcs: 1,
    maxMembers: 0,
  };
}

export async function loadOwnerPlanLimits(db: sql.ConnectionPool, ownerId: string): Promise<PlanLimits> {
  let row: UserPlanRow | undefined;

  // Backward compatibility: in case plan_type does not exist yet.
  try {
    const result = await db
      .request()
      .input("id", ownerId)
      .query<UserPlanRow>("SELECT account_type, plan_type, email FROM users WHERE id = @id");
    row = result.recordset[0];
  } catch {
    const result = await db
      .request()
      .input("id", ownerId)
      .query<UserPlanRow>("SELECT account_type, email FROM users WHERE id = @id");
    row = result.recordset[0];
  }

  const limits = resolvePlanLimits(row?.account_type ?? null, row?.plan_type ?? null);

  // Override hardcodeado: correos internos con RFC (y miembros) ilimitados.
  if (isUnlimitedEmail(row?.email)) {
    return { ...limits, maxRfcs: UNLIMITED_LIMIT, maxMembers: UNLIMITED_LIMIT };
  }

  return limits;
}
