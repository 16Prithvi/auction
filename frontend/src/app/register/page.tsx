import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth-screen";

export const metadata: Metadata = {
  title: "Register · Auction",
};

export default function RegisterPage() {
  return <AuthScreen mode="register" />;
}
