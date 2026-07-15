import { getRequiredSession, hasManagementAccess } from "@/lib/session";
import { ScanScreen } from "@/components/scan/ScanScreen";

export default async function ScanPage() {
  const session = await getRequiredSession();
  return (
    <ScanScreen
      canOverride={hasManagementAccess(session)}
      sessionUserId={session.user.id}
    />
  );
}
