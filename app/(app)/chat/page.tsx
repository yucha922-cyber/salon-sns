import Link from "next/link";
import { requireAppContext } from "@/lib/auth/context";
import { PageHeading } from "@/components/ui/page-heading";
import { ChatView } from "@/components/chat/chat-view";

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ c?: string; new?: string }> }) {
  const { user, repo, current, brain } = await requireAppContext();
  const params = await searchParams;
  const orgId = current.organization.id;
  const conversations = await repo.listConversations(orgId);
  const selectedId = params.new ? null : (params.c ?? conversations[0]?.id ?? null);
  const conversation = selectedId ? await repo.getConversation(orgId, selectedId) : null;
  const brandName = brain.brandName || brain.companyName;
  const locationName = brain.locations[0]?.name ?? brandName;
  const audience = [brain.targetAudience.ageRange, brain.targetAudience.gender.split(/[\s/]/)[0]].filter(Boolean).join("");
  const firstName = user.displayName.split(/\s+/).pop() ?? user.displayName;
  const name = user.displayName.trim();
  const initials = /[^\x00-\x7F]/.test(name) ? name.slice(0, 1) : name.split(/\s+/).map((s) => s[0]).join("").slice(0, 2) || "U";

  const prompts = [
    { label: "今月の投稿アイデア", prompt: "今月Instagram何投稿したらいい？" },
    { label: `${audience || "ターゲット"}向けの投稿案`, prompt: `${audience || "メインターゲット"}向けに投稿案考えて` },
    { label: "強みを使った広告案", prompt: "うちの強みを使って広告案作って" },
  ];

  return (
    <>
      <PageHeading eyebrow="いつでも相談" title="AIマーケター" description="Brand Brainと運用データを理解した、あなたのチームの一員。" />
      <section className="chat-layout">
        <ChatView
          key={conversation?.id ?? "new"}
          conversationId={conversation?.id ?? null}
          initialMessages={conversation?.messages ?? []}
          brandName={brandName}
          locationName={locationName}
          userInitials={initials}
          prompts={prompts}
          greeting={`${firstName}さん、こんにちは。${brandName}のBrand Brainを読み込みました。\n\nターゲットは「${[brain.targetAudience.ageRange, brain.targetAudience.occupation].filter(Boolean).join("・") || "未設定"}」、強みは「${brain.strengths.slice(0, 2).join("・") || "未設定"}」ですね。SNS投稿や広告のこと、なんでも相談してください。`}
        />
        <aside className="chat-side">
          <div className="context-card">
            <h3>参照中のBrand Brain</h3>
            <div className="context-line"><span>業種</span><b>{brain.industry.label || "未設定"}</b></div>
            <div className="context-line"><span>店舗</span><b>{locationName}</b></div>
            <div className="context-line"><span>ターゲット</span><b>{brain.targetAudience.ageRange || "未設定"}</b></div>
            <div className="context-line"><span>目標</span><b>{brain.marketingGoals ? brain.marketingGoals.slice(0, 16) : "未設定"}</b></div>
            <div className="context-label">主な悩み</div>
            <div className="brand-tags">
              {brain.targetAudience.painPoints.slice(0, 4).map((p) => <span className="brand-tag" key={p}>{p}</span>)}
              {brain.targetAudience.painPoints.length === 0 && <span className="activity-note">未設定</span>}
            </div>
            <Link className="button small" style={{ marginTop: 12 }} href="/brand">Brand Brainを編集</Link>
          </div>
          <div className="context-card">
            <h3>過去の相談</h3>
            {conversations.length === 0 && <p className="activity-note">まだ相談履歴はありません。</p>}
            {conversations.slice(0, 8).map((c) => (
              <Link key={c.id} href={`/chat?c=${c.id}`} className={`conversation-link ${c.id === conversation?.id ? "active" : ""}`}>
                {c.title}
              </Link>
            ))}
          </div>
        </aside>
      </section>
    </>
  );
}
