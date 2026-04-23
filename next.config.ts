import { setDefaultResultOrder } from "node:dns";
import type { NextConfig } from "next";

// Windows: long hangs / "application-code" 30–120s to Supabase often fix (IPv6/DNS)
setDefaultResultOrder("ipv4first");

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
