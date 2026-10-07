"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completeAdsConnectionAction, disconnectAdAccountAction, importConversionsCsvAction, recordConversionAction, updateCampaignSettingsAction } from "@/app/actions/ads";
import { Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

type Option = { id: string; label: string };

export function AccountSelection({ accounts, locations }: { accounts: { externalAccountId: string; name: string; currency: string; timezone: string; businessName: string | null }[]; locations: Option[] }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<Record<string, string | null>>({ [accounts[0]?.externalAccountId ?? ""]: "" });
  return (
    <div className="panel" data-testid="ad-account-selection">
      <div className="panel-title">接続する広告アカウントを選択</div>
      <p className="field-hint" style={{ marginTop: 6 }}>店舗を指定すると、その店舗の担当者だけが閲覧・操作できます（未指定＝本部・全店舗）。</p>
      {accounts.map((a) => (
        <div className="conn-row" key={a.externalAccountId} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0" }}>
          <input
            type="checkbox"
            checked={a.externalAccountId in picked}
            onChange={(e) =>
              setPicked((p) => {
                const n = { ...p };
                if (e.target.checked) n[a.externalAccountId] = "";
                else delete n[a.externalAccountId];
                return n;
              })
            }
          />
          <div style={{ flex: 1 }}>
            <b style={{ fontSize: 11 }}>{a.name}</b>
            <div className="table-muted" style={{ fontSize: 9 }}>
              {a.externalAccountId} · {a.currency} · {a.timezone}
              {a.businessName ? ` · ${a.businessName}` : ""}
            </div>
          </div>
          <select className="select-small" value={picked[a.externalAccountId] ?? ""} disabled={!(a.externalAccountId in picked)} onChange={(e) => setPicked((p) => ({ ...p, [a.externalAccountId]: e.target.value }))}>
            <option value="">本部（全店舗）</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      ))}
      <button
        className="button primary section-spacer"
        disabled={pending || !Object.keys(picked).filter(Boolean).length}
        onClick={() =>
          start(async () => {
            const r = await completeAdsConnectionAction(Object.entries(picked).filter(([k]) => k).map(([externalAccountId, locationId]) => ({ externalAccountId, locationId: locationId ?? "" })));
            if (!r.ok) return toast(r.error, "error");
            toast(`${r.data.connected}件の広告アカウントを接続し、過去30日のデータを同期しました`);
            router.replace("/ads");
          })
        }
        data-testid="complete-connection"
      >
        {pending ? <Spinner /> : null} 接続して同期
      </button>
    </div>
  );
}

export function DisconnectButton({ adAccountId, name }: { adAccountId: string; name: string }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      className="button small"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`${name} の接続を解除しますか？（保存済みのトークンは削除されます。同期済みのデータは残ります）`)) return;
        start(async () => {
          const r = await disconnectAdAccountAction(adAccountId);
          if (!r.ok) return toast(r.error, "error");
          toast("接続を解除しました");
          router.refresh();
        });
      }}
    >
      接続解除
    </button>
  );
}

export function CampaignSettingsRow({
  campaign,
  locations,
  readOnly,
}: {
  campaign: { id: string; name: string; goal: string; landingPageUrl: string | null; locationId: string | null; conversionEvent: string | null; objective: string | null; status: string };
  locations: Option[];
  readOnly: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ goal: campaign.goal === "recruitment" ? "recruitment" : "acquisition", landingPageUrl: campaign.landingPageUrl ?? "", locationId: campaign.locationId ?? "", conversionEvent: campaign.conversionEvent ?? "" });
  return (
    <tr>
      <td className="table-strong" style={{ whiteSpace: "normal", minWidth: 150 }}>
        {campaign.name}
        <div className="table-muted" style={{ fontSize: 9 }}>
          {campaign.objective} · {campaign.status}
        </div>
      </td>
      <td>
        <select className="select-small" value={form.goal} disabled={readOnly} onChange={(e) => setForm({ ...form, goal: e.target.value })}>
          <option value="acquisition">集客（予約）</option>
          <option value="recruitment">採用（応募）</option>
        </select>
      </td>
      <td>
        <select className="select-small" value={form.locationId} disabled={readOnly} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
          <option value="">本部（全店舗）</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input className="input" style={{ minWidth: 200, padding: "6px 8px" }} value={form.landingPageUrl} disabled={readOnly} placeholder="https://" onChange={(e) => setForm({ ...form, landingPageUrl: e.target.value })} />
      </td>
      <td>
        <input className="input" style={{ width: 130, padding: "6px 8px" }} value={form.conversionEvent} disabled={readOnly} placeholder="Schedule / Lead" onChange={(e) => setForm({ ...form, conversionEvent: e.target.value })} />
      </td>
      <td>
        {!readOnly && (
          <button
            className="button small"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await updateCampaignSettingsAction(campaign.id, form as { goal: "acquisition" | "recruitment"; landingPageUrl: string; locationId: string; conversionEvent: string });
                if (!r.ok) return toast(r.error, "error");
                toast("保存しました（次回の同期・分析から反映）");
                router.refresh();
              })
            }
          >
            保存
          </button>
        )}
      </td>
    </tr>
  );
}

const KINDS = [
  ["reservation", "予約"],
  ["visit", "来店"],
  ["contract", "契約（回数券など）"],
  ["lead", "問い合わせ"],
  ["application", "応募"],
  ["revenue", "売上のみ"],
] as const;

export function ConversionForms({ campaigns, today }: { campaigns: Option[]; today: string }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ occurredOn: today, kind: "reservation", count: "1", revenue: "", campaignId: campaigns[0]?.id ?? "", note: "" });
  const [csv, setCsv] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  return (
    <div className="content-grid" style={{ marginTop: 0 }}>
      <div className="panel">
        <div className="panel-title" style={{ marginBottom: 10 }}>手入力</div>
        <div className="two-fields">
          <div className="field">
            <label>日付</label>
            <input className="input" type="date" value={form.occurredOn} onChange={(e) => setForm({ ...form, occurredOn: e.target.value })} />
          </div>
          <div className="field">
            <label>種類</label>
            <select className="select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {KINDS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>件数</label>
            <input className="input" type="number" min={0} value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} />
          </div>
          <div className="field">
            <label>売上（円・任意）</label>
            <input className="input" type="number" min={0} value={form.revenue} onChange={(e) => setForm({ ...form, revenue: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label>キャンペーン</label>
          <select className="select" value={form.campaignId} onChange={(e) => setForm({ ...form, campaignId: e.target.value })}>
            <option value="">指定しない（本部）</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>メモ</label>
          <input className="input" value={form.note} maxLength={300} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
        <button
          className="button primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await recordConversionAction({ ...form, kind: form.kind as "reservation" });
              if (!r.ok) return toast(r.error, "error");
              toast("記録しました");
              router.refresh();
            })
          }
        >
          記録する
        </button>
      </div>
      <div className="panel">
        <div className="panel-title" style={{ marginBottom: 6 }}>CSV取り込み</div>
        <p className="field-hint">ヘッダー: date, kind, count, revenue, campaign, note（kindは reservation / visit / contract / lead / application / revenue、または 予約・来店・契約・応募・売上）</p>
        <textarea className="textarea" style={{ minHeight: 120, fontFamily: "monospace" }} value={csv} placeholder={"date,kind,count,revenue,campaign,note\n2026-10-01,予約,3,,渋谷院 新規集客,電話予約"} onChange={(e) => setCsv(e.target.value)} />
        <input
          type="file"
          accept=".csv,text/csv"
          style={{ fontSize: 10, margin: "8px 0" }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setCsv(await f.text());
          }}
        />
        <div>
          <button
            className="button"
            disabled={pending || !csv.trim()}
            onClick={() =>
              start(async () => {
                const r = await importConversionsCsvAction(csv);
                if (!r.ok) return toast(r.error, "error");
                setErrors(r.data.errors);
                toast(`${r.data.saved}件を取り込みました`);
                router.refresh();
              })
            }
          >
            取り込む
          </button>
        </div>
        {errors.length > 0 && (
          <ul className="issue-list" style={{ marginTop: 8 }}>
            {errors.slice(0, 10).map((e) => (
              <li key={e} className="issue warning">
                <small>{e}</small>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
