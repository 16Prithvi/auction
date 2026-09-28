import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth-screen";

export const metadata: Metadata = {
  title: "Log in · Auction",
};

export default function LoginPage() {
  return <AuthScreen mode="login" />;
}
