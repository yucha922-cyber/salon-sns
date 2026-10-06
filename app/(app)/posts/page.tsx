import Link from "next/link";
import { requireAppContext } from "@/lib/auth/context";
import { PageHeading } from "@/components/ui/page-heading";
import { PostsTable } from "@/components/posts/posts-table";

export default async function PostsPage() {
  const { repo, current } = await requireAppContext();
  const posts = await repo.listPosts(current.organization.id);
  return (
    <>
      <PageHeading eyebrow="コンテンツ管理" title="投稿一覧" description="すべてのSNS投稿をまとめて管理。"
        actions={<Link className="button primary" href="/creator"><span className="plus">＋</span> 投稿を作成</Link>} />
      <PostsTable posts={posts} />
    </>
  );
}
