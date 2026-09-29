import Link from "next/link";
import { Logo, LogoMark } from "@/components/ui/logo";

/** The brand in the website editor's sign-in and header. */
export const EditorLogo = () => <Logo />;
export const EditorIcon = () => <LogoMark size={28} />;

/** In place of Payload's log-out button: staff sign out in the staff console. */
export const BackToConsole = () => (
  <Link href="/admin" aria-label="Back to the staff console" title="Back to the staff console" style={{ fontSize: 13 }}>
    Staff console
  </Link>
);
