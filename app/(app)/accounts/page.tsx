import { requireAppContext } from "@/lib/auth/context";
import { PageHeading } from "@/components/ui/page-heading";
import { AccountsBoard } from "@/components/accounts/accounts-board";

export default async function AccountsPage() {
  const { repo, current, brain } = await requireAppContext();
  const orgId = current.organization.id;
  const [accounts, posts] = await Promise.all([repo.listAccounts(orgId), repo.listPosts(orgId)]);
  const postCounts: Record<string, number> = {};
  for (const p of posts) if (p.accountId) postCounts[p.accountId] = (postCounts[p.accountId] ?? 0) + 1;
  return (
    <>
      <PageHeading eyebrow="本部・店舗" title="アカウント戦略"
        description="SNSアカウントごとに目的（集客・採用・ブランディング）と運用戦略を設計します。AIはこの戦略に沿って投稿を作ります。" />
      <AccountsBoard
        accounts={accounts}
        locations={brain.locations.flatMap((l) => (l.id ? [{ id: l.id, name: l.name }] : []))}
        postCounts={postCounts}
        readOnly={current.role === "viewer"}
      />
    </>
  );
}
