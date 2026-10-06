"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { renameOrganizationAction } from "@/app/actions/organization";
import { Field } from "@/components/ui/form";
import { Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";

export function WorkspaceForm({ name, canEdit }: { name: string; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const save = () =>
    startTransition(async () => {
      const result = await renameOrganizationAction({ name: value });
      if (!result.ok) return setError(result.error);
      setError(null);
      toast("ワークスペース設定を保存しました");
      router.refresh();
    });
  return (
    <>
      <Field label="ワークスペース名（組織名）" htmlFor="orgName" error={error ?? undefined}>
        <input id="orgName" className="input" value={value} onChange={(e) => setValue(e.target.value)} disabled={!canEdit} />
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="button primary" onClick={save} disabled={!canEdit || pending || !value.trim() || value === name}>
          {pending && <Spinner />} 変更を保存
        </button>
      </div>
    </>
  );
}
