import { getSession } from "@/lib/session";
import { resolveMembership } from "@/lib/membership";
import { MembershipProvider } from "../components/MembershipProvider";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const membership = await resolveMembership(session);

  return (
    <MembershipProvider initial={membership}>{children}</MembershipProvider>
  );
}
