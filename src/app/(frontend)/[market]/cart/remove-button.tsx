"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { removeFromCartAction } from "./actions";

export function RemoveButton({ name }: { name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await removeFromCartAction(name);
          router.refresh();
        })
      }
      className="text-callout font-semibold text-link hover:underline disabled:opacity-70"
      aria-label={`Remove ${name} from your cart`}
    >
      Remove
    </button>
  );
}
