import { requireAppContext } from "@/lib/auth/context";
import { loadAdsPageData } from "@/lib/ads/app";
import { fmtYen } from "@/lib/ads/metrics";
import { jstDateKey } from "@/lib/domain/dates";
import { PageHeading } from "@/components/ui/page-heading";
import { AdsTabs } from "@/components/ads/ui";
import { ConversionForms } from "@/components/ads/connect-forms";

export const metadata = { title: "自社計測CV" };

const KIND_LABEL: Record<string, string> = { reservation: "予約", visit: "来店", contract: "契約", lead: "問い合わせ", application: "応募", revenue: "売上" };

export default async function ConversionsPage() {
  const app = await requireAppContext();
  const { ctx, ws } = await loadAdsPageData(app);
  const conversions = (await ctx.reader.listConversions(ctx.organizationId)).slice(0, 100);
  const campaignName = new Map(ws.campaigns.map((c) => [c.id, c.name]));
  return (
    <>
      <PageHeading eyebrow="Meta広告 × AI" title="自社計測のコンバージョン" description="予約システム・電話・来店・契約・応募など、Metaでは計測できない成果を記録します。Meta計測のCVとは合算せず、別の列として表示します。" />
      <AdsTabs current="/ads/conversions" />
      {ctx.role !== "viewer" && <ConversionForms campaigns={ws.campaigns.map((c) => ({ id: c.id, label: c.name }))} today={jstDateKey(new Date())} />}
      <div className="panel section-spacer">
        <div className="panel-title" style={{ marginBottom: 8 }}>記録（新しい順）</div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>日付</th>
                <th>種類</th>
                <th>件数</th>
                <th>売上</th>
                <th>キャンペーン</th>
                <th>入力方法</th>
                <th>メモ</th>
              </tr>
            </thead>
            <tbody>
              {conversions.map((c) => (
                <tr key={c.id}>
                  <td>{c.occurredOn}</td>
                  <td>{KIND_LABEL[c.kind] ?? c.kind}</td>
                  <td>{c.count}</td>
                  <td>{c.revenue === null ? "—" : fmtYen(c.revenue)}</td>
                  <td>{c.campaignId ? (campaignName.get(c.campaignId) ?? "—") : "本部"}</td>
                  <td>{c.source === "csv" ? "CSV" : c.source === "api" ? "API" : "手入力"}</td>
                  <td className="table-muted">{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!conversions.length && <div className="insufficient">まだ記録はありません。</div>}
      </div>
    </>
  );
}
