import { Poppins } from "next/font/google";

// brand/BRAND.md: Poppins through next/font/google, weights 300 to 700.
export const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});
