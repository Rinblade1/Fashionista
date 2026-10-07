import Dock from "@/components/Dock";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <Dock current="outfits">{children}</Dock>;
}
