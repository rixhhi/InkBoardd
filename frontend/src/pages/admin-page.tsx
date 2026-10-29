/**
 * Admin dashboard shell. Each tab lives in pages/admin/*.
 * The Admins tab is shown to the super admin only (the API enforces it too).
 */
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Activity as ActivityIcon, Crown, History, LayoutDashboard, Settings2, Share2, Users, UsersRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageBody, PageHeader, Tabs } from "@/components/ui";
import { useIsSuperAdmin } from "@/lib/session";
import { OverviewTab } from "./admin/overview-tab";
import { MembersTab } from "./admin/members-tab";
import { MemberDetailView } from "./admin/member-detail";
import { GroupsTab } from "./admin/groups-tab";
import { SharingTab } from "./admin/sharing-tab";
import { ActivityTab, AuditTab } from "./admin/activity-tab";
import { SettingsTab } from "./admin/settings-tab";
import { AdminsTab } from "./admin/admins-tab";

const BASE_TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "members", label: "Members", icon: Users },
  { id: "groups", label: "Groups", icon: UsersRound },
  { id: "sharing", label: "Sharing", icon: Share2 },
  { id: "activity", label: "Activity", icon: ActivityIcon },
  { id: "audit", label: "Audit log", icon: History },
  { id: "settings", label: "Settings", icon: Settings2 },
] as const;
const ADMINS_TAB = { id: "admins", label: "Admins", icon: Crown } as const;

type TabId = (typeof BASE_TABS)[number]["id"] | "admins";

export default function AdminPage() {
  const search = useSearch({ from: "/admin" });
  const nav = useNavigate();
  const superadmin = useIsSuperAdmin();
  const tabs = superadmin ? [...BASE_TABS, ADMINS_TAB] : BASE_TABS;
  const wanted = (search.tab ?? "overview") as TabId;
  const tab: TabId = tabs.some((t) => t.id === wanted) ? wanted : "overview";
  const setTab = (id: string) => void nav({ to: "/admin", search: { tab: id as TabId } });

  if (search.member != null) return <MemberDetailView id={search.member} />;

  return (
    <AppShell>
      <PageHeader
        eyebrow={superadmin ? "Super admin" : "Admin"}
        title="Admin dashboard"
        subline="Add members, group them, choose what they can open, and see how they study."
        tabs={<Tabs tabs={tabs} value={tab} onChange={setTab} label="Admin sections" />}
      />
      <PageBody>
        {/* key={tab} remounts the panel so each tab body gets the same short arrival instead of popping. */}
        <div key={tab} role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="enter">
          {tab === "overview" ? <OverviewTab onGo={setTab} /> : null}
          {tab === "members" ? <MembersTab /> : null}
          {tab === "groups" ? <GroupsTab /> : null}
          {tab === "sharing" ? <SharingTab /> : null}
          {tab === "activity" ? <ActivityTab /> : null}
          {tab === "audit" ? <AuditTab /> : null}
          {tab === "settings" ? <SettingsTab /> : null}
          {tab === "admins" && superadmin ? <AdminsTab /> : null}
        </div>
      </PageBody>
    </AppShell>
  );
}
