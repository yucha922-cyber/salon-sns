"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cancelPublishJobAction, runSocialQueueAction } from "@/app/actions/social";
import { Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

export function QueueActions({ jobId, status, readOnly }: { jobId: string; status: string; readOnly: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  if (readOnly || !(status === "queued" || status === "retrying")) return null;
  return (
    <button
      className="button small"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await cancelPublishJobAction(jobId);
          if (!r.ok) return toast(r.error, "error");
          toast("予約を取り消しました");
          router.refresh();
        })
      }
    >
      {pending && <Spinner />} 取り消す
    </button>
  );
}

export function RunQueueButton() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <button
      className="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await runSocialQueueAction();
          if (!r.ok) return toast(r.error, "error");
          toast(`キューを処理しました（投稿 ${r.data.published}件・Insights ${r.data.snapshots}件・AI分析 ${r.data.reviews}件）`);
          router.refresh();
        })
      }
    >
      {pending && <Spinner />} ↻ 今すぐキューを処理
    </button>
  );
}
