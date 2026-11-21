"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ModelOption } from "@/lib/ai/models";

export interface ModelsResponse {
  source: "own" | "global";
  models: ModelOption[];
  litellm: boolean;
  selected: string | null;
  error?: string;
}

/** Models for the user's current mode (own key → live discovery; shared → allow-list). */
export function useAIModels(enabled = true) {
  const qc = useQueryClient();
  const query = useQuery<ModelsResponse>({
    queryKey: ["ai-models"],
    queryFn: async () => {
      const res = await fetch("/api/ai/models");
      if (!res.ok) throw new Error("Couldn't load models");
      return res.json();
    },
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
  });

  const select = useMutation({
    mutationFn: async (model: string) => {
      const res = await fetch("/api/ai/models", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't switch model");
      return model;
    },
    onMutate: (model) => {
      qc.setQueryData<ModelsResponse>(["ai-models"], (d) => (d ? { ...d, selected: model } : d));
    },
    onSuccess: (model) => {
      toast.success(`Model: ${model}`);
      qc.invalidateQueries({ queryKey: ["ai-status"] });
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Couldn't switch model");
      qc.invalidateQueries({ queryKey: ["ai-models"] });
    },
  });

  return { ...query, select };
}
