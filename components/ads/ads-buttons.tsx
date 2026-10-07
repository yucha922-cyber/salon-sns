"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { runAdAnalysisAction, syncAdAccountAction } from "@/app/actions/ads";
import { Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

export function AnalyzeAdsButton({ disabled }: { disabled?: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      className="button primary"
      disabled={disabled || pending}
      onClick={() =>
        start(async () => {
          const r = await runAdAnalysisAction();
          if (!r.ok) return toast(r.error, "error");
          toast(`AI分析が完了しました（検知${r.data.findings}件・新しい仮説${r.data.hypotheses}件）`);
          router.refresh();
        })
      }
    >
      {pending ? <Spinner /> : "✳"} AIで分析する
    </button>
  );
}

export function SyncAdsButton({ adAccountId, disabled }: { adAccountId: string; disabled?: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      className="button"
      disabled={disabled || pending}
      onClick={() =>
        start(async () => {
          const r = await syncAdAccountAction(adAccountId);
          if (!r.ok) return toast(r.error, "error");
          toast(`同期しました（〜${r.data.until}、${r.data.snapshots}件）`);
          router.refresh();
        })
      }
    >
      {pending ? <Spinner /> : "↻"} 今すぐ同期
    </button>
  );
}
