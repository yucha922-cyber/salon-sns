import { requireAppContext } from "@/lib/auth/context";
import { PageHeading } from "@/components/ui/page-heading";
import { AccountsBoard } from "@/components/accounts/accounts-board";

export default async function AccountsPage() {
  const { repo, current, brain } = await requireAppContext();
  const orgId = current.organization.id;
  const [accounts, posts, pillars] = await Promise.all([repo.listAccounts(orgId), repo.listPosts(orgId), repo.listContentPillars(orgId)]);
  const postCounts: Record<string, number> = {};
  for (const p of posts) if (p.accountId) postCounts[p.accountId] = (postCounts[p.accountId] ?? 0) + 1;
  return (
    <>
      <PageHeading eyebrow="本部・店舗" title="アカウント戦略"
        description="本部と各店舗のSNSアカウントごとに「何のために運用するか」と運用戦略を設定します。AIの月間計画・投稿作成はこの戦略に沿って動きます。" />
      <AccountsBoard
        accounts={accounts}
        locations={brain.locations.flatMap((l) => (l.id ? [{ id: l.id, name: l.name }] : []))}
        pillars={pillars}
        postCounts={postCounts}
        readOnly={current.role === "viewer"}
      />
    </>
  );
}
