"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLearningStatusAction } from "@/app/actions/social";
import { useToast } from "@/components/ui/toast";

export function LearningStatusButton({ id, status }: { id: string; status: "active" | "archived" }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const next = status === "active" ? "archived" : "active";
  return (
    <button
      className="button small"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await setLearningStatusAction({ id, status: next });
          if (!r.ok) return toast(r.error, "error");
          toast(next === "archived" ? "アーカイブしました（今後の企画には使われません）" : "有効にしました");
          router.refresh();
        })
      }
    >
      {status === "active" ? "アーカイブ" : "有効に戻す"}
    </button>
  );
}
